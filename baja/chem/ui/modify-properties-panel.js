function (graph, genegraph_panel_layout) {

    let text__ = ``
    return new Promise(async (resolve, reject) => {
        let jsonPanel = null;
        let cb = createIonFunction((___panel) => {
            jsonPanel = ___panel;
        })
        let outputPanel = null;
        let cb2 = createIonFunction((___panel) => {
            outputPanel = ___panel;
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
                if (k === 'RNA1') {
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

        let rjl = `
        # Each track contains a list of oligos. (i.e. sirna, aso, etc... )
         for t in tracks:
            for o in t.oligos:
                o.sequence = t.getSequenceRange(o.xi, o.xf);
        `
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
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
                                                    'label': 'Set sequences', 'ionfunction': createIonFunction(async () => {
                                                        jsonPanel.data = rjl
                                                    })
                                                },
                                            ]
                                        },
                                        {
                                            'label': 'API', 'items': [
                                                {
                                                    'label': 'Track', 'ionfunction': createIonFunction(async () => {

                                                    })
                                                },
                                                {
                                                    'label': 'Oligo', 'ionfunction': createIonFunction(async () => {

                                                    })
                                                },
                                                {
                                                    'label': 'Graph', 'ionfunction': createIonFunction(async () => {

                                                    })
                                                },
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

        let l = ''
        function writelog(msg) {
            l += msg;
        }

        function convertToJavaScript(codeString) {

            codeString = codeString.replace(/print\s*\((.*)\)/g, 'writelog($1)');

            let cleanCode = codeString.split('\n')
                .map(line => line.split('#')[0].trim())
                .filter(line => line.length);

            let translatedCode = cleanCode.map(line => {
                if (line.startsWith("for") && line.includes("in")) {

                    return line.replace(/for\s+(\w+)\s+in\s+(\w+):/, '$2.forEach($1 => {');
                } else if (line.trim().startsWith("print")) {

                    return line.replace(/print\s*\((.*)\)/, 'writelog($1)');
                } else {

                    if (!line.trim().endsWith(';'))
                        line = line + ';'
                    return line;
                }
            }).join('\n');

            translatedCode = translatedCode.replace(/forEach\((\w+) => {\s+for\s+(\w+)\s+in\s+(\w+)\.(\w+):/g, 'forEach($1 => { $3.$4.forEach($2 => {');

            const openBraces = (translatedCode.match(/{/g) || []).length;
            const closeBraces = (translatedCode.match(/}/g) || []).length;
            const neededBraces = openBraces - closeBraces;
            for (let i = 0; i < neededBraces; i++) {
                translatedCode += '});';
            }

            return translatedCode;
        }

        const pythonCode = `
            for t in tracks:
                for o in t.oligos:
                    o.sequence = t.getSequenceRange(o.xi, o.xf); # Assign sequence based on range
        `;

        const jsCode = convertToJavaScript(pythonCode);
        console.log(jsCode);

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
                                'data': ` <h2 color='red'> Edit compound properties...  </h2>

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
                                    code: text__.toString(),
                                    height: "350px",
                                    showButton: false,

                                    editorOptions: { language: 'python', automaticLayout: true },
                                    keybinding: {
                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                        })
                                    },
                                }
                            }
                        },

                    ],
                    [
                        {

                            'width': '100%',
                            'component':
                            {
                                wid: 'text-editor',
                                refCallback: cb2,
                                data: {
                                    code: '',
                                    height: "150px",
                                    showButton: false,
                                    editorOptions: { language: 'python', automaticLayout: true },
                                    keybinding: {
                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                        })
                                    },
                                }
                            }
                        },
                    ],
                    [
                        {
                            'title': ' ', 'body': ``,
                            'width': '100%',
                            'component':
                            {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Run', ionFunction: createIonFunction(async () => {
                                                let value = jsonPanel.code;
                                                let js = convertToJavaScript(value)
                                                console.log(js);
                                                try {

                                                    l = '';
                                                    let ejs = `let tracks=graph.track;\n

                                                    ` + js;
                                                    eval(ejs);

                                                    outputPanel.code = l;
                                                } catch (error) {
                                                    console.error("Error executing the JavaScript code:", error);
                                                    l = error;
                                                    outputPanel.code = '' + error;

                                                }

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
