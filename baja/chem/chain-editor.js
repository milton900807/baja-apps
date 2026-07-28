function (chain, label, updateChain, highlight_structure) {
    let editorComponent;
    let item = {
        wid: 'card',
        data: {
            padding: 2,
            'style.padding-left': '22px',
            cards: [
                [
                    {
                        'width': '100%',
                        'height': '50px',
                        'component':
                        {
                            wid: 'html',
                            data: `<h5> ${label} </h5> `
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
                            refCallback: createIonFunction( (editor)=>{
                                editorComponent = editor;
                            }),
                            componentRef: 'chain_editor',
                            data: {
                                height: '55px',
                                code: chain.toString(),
                                onDidChangeCursorPosition: createIonFunction(highlight_structure),
                                onDidFocusEditorWidget: createIonFunction(() => {
                                }),
                                onMouseDown: createIonFunction(() => {
                                }),
                                onKeyUp: createIonFunction((editor) => {
                                       let t = editorComponent.code;
                                        t = t.replace(/ /g, '')
                                        updateChain(t);

                                }),

                                editorOptions: {
                                    language: 'text', automaticLayout: true, lineHeight: 45, fontSize: 16, codeLens: false, lineNumbers: 'off', glyphMargin: false,
                                    minimap: { enabled: false }, scrollbar: { verticalScrollbarSize: 0, verticalHasArrows: false }, verticalHasArrows: false, height: '50px',
                                    colors: {
                                        'editor.foreground': '#000000',
                                        'editor.background': '#EDF9FA',
                                        'editorCursor.foreground': '#8B0000',
                                        'editor.lineHighlightBackground': '#0000FF20',
                                        'editorLineNumber.foreground': '#008800',
                                        'editor.selectionBackground': '#88000030',
                                        'editor.inactiveSelectionBackground': '#88000015'
                                    }
                                }
                                ,
                                libs: [
                                    { 'name': 'core', 'path': 'genome/lib/core.js' },
                                ],
                                keybinding: {
                                    'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {
                                    })
                                },
                            }
                        }
                    },
                ]]
        }
    }
    return item;

}
