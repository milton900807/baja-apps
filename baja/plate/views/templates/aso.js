function (template, libid) {
    if (!template) {
        template = `moe()sp.moe()sp.moe()sp.moe()sp.moe()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.moe()sp.moe()sp.moe()sp.moe()sp.moe()`
    }
    return new Promise(async (resolve, reject) => {
        exec('baja/chem/monomers.js', libid).then(async (monomers) => {
            class InputB {
                templateInput;
            }
            let ib = new InputB();
            let save_menu = await exec('baja/chem/aso-template-menu.js', ib)
            let innerComponentCallback = (ref) => {
                ib.templateInput = ref;
            }
            let monomerComponent = null;
            let monomerComponentCallback = (ref) => {
                console.log('debubg');
                monomerComponent = ref;
            }

            let highlight_structure = (e) => {
                let column = e.position.column;
                if (!ib.templateInput) {
                    return;
                }
                let lines = ib.templateInput.getLines();
                let top = lines.split('\n');
                top_str = top[0].trim();

                let temp = top_str.substring(0, column);
                let li = temp.lastIndexOf('.');
                let lf = temp.lastIndexOf(')')
                let lb = temp.lastIndexOf('(')
                if (lf > li)
                    li = lf;
                if (lb > li)
                    li = lb;

                let end = top_str.indexOf('(', column - 1)
                let end2 = top_str.indexOf('.', column - 1)
                let end3 = top_str.indexOf(')', column - 1)
                if (end2 > 0 && end2 < end) {
                    end = end2;
                }
                if (end3 > 0 && end3 < end) {
                    end = end3;
                }
                if (end < 0) {
                    end = top_str.length;
                }

                let monomer = top_str.substring(li + 1, end);
                console.log(monomer)
                updateCalculation(monomer)

            }

            let updateCalculation = (symb) => {

                for (let m of monomers.monomers) {
                    if (m.symbol === symb) {
                        monomerComponent.setMonomer(m)
                    }
                }
            }

            let asoEditor = {
                wid: 'card',
                data: {
                    cards: [
                        [
                            {
                                'title': '', 'body': ` `,
                                'width': '4%',
                                'height': '50px',
                                'component':
                                {
                                    wid: 'html',
                                    data: "<h5><font color='lightGraph'> 5' </font> </h5> "
                                }
                            },
                            {
                                'title': '', 'body': `
                                            `,
                                'width': '90%',
                                'height': '50px',
                                'component':
                                {
                                    wid: 'text-editor',
                                    refCallback: createIonFunction(innerComponentCallback),
                                    componentRef: 'aso_editor',
                                    data: {
                                        height: '50px',
                                        code: template,
                                        onKeyUp: createIonFunction((editor) => {

                                        }),
                                        onDidChangeCursorPosition: createIonFunction(highlight_structure),
                                        editorOptions: {
                                            language: 'text', automaticLayout: true, lineHeight: 45, fontSize: 16, codeLens: false, lineNumbers: 'off', glyphMargin: false,
                                            minimap: { enabled: false }, scrollbar: { verticalScrollbarSize: 0, verticalHasArrows: false }, verticalHasArrows: false, height: '50px',
                                            colors: {
                                                'editorWidget.border': '2px',
                                                'editor.foreground': '#000000',
                                                'editor.background': '#EDF9FA',
                                                'editorCursor.foreground': '#8B0000',
                                                'editor.lineHighlightBackground': '#0000FF20',
                                                'editorLineNumber.foreground': '#008800',
                                                'editor.selectionBackground': '#88000030',
                                                'editor.inactiveSelectionBackground': '#88000015'
                                            },
                                        },
                                    }
                                }
                            }
                            ,
                            {
                                'title': '', 'body': `

                                            `,
                                'width': '4%',
                                'height': '50px',
                                'component':
                                {
                                    wid: 'title',
                                    data: "<h5> 3' </h5> "
                                }
                            },
                        ]
                    ]
                }
            }
            resolve(asoEditor)
        });
    })
}
