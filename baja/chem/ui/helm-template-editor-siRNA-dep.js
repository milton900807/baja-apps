function (graph, genegraph_panel_layout) {

    let text__ = ``
    return new Promise(async (resolve, reject) => {
        let jsonPanel = null;
        let cb = createIonFunction((___panel) => {
            jsonPanel = ___panel;
        })

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
            let matches = inputString.match(/RNA\d*\{([^}]*)\}/);
            if (!matches) return [];

            let chainsString = matches[0];
            let chainsArray = chainsString.split(',').map(chain => chain.trim());

            return chainsArray;
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
                                'data': ` <h2 color='red'> Edit template chemistry...  </h2>
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
                                                let value = jsonPanel.getWidgetValue();
                                                let matches = value.match(/RNA/gi);
                                                if (matches.length != 2) {
                                                    infoPrompt(" Most have two strands:  RNA1 == passenger & RNA2 == guide.")
                                                    return;
                                                }
                                                let chains = parseChains(value);
                                                for (let c of chains) {
                                                    if (c.startsWith('RNA1')) {
                                                        for (let t of graph.track) {
                                                            for (let o of t.oligos) {
                                                                if (o.type.toLowerCase() === 'sirna') {
                                                                    let chain1 = applyTemplate ( c, o.sequence )
                                                                    o.structure = replaceChain ( o.structure, 1, chain1)
                                                                }
                                                            }
                                                        }
                                                    } else if (c.startsWith('RNA2')) {
                                                        for (let t of graph.track) {
                                                            for (let o of t.oligos) {
                                                                if (o.type.toLowerCase() === 'sirna') {
                                                                    let chain2 = applyTemplate ( c, o.synthesisSequence )
                                                                    o.structure = replaceChain ( o.structure, 2, chain2)
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
