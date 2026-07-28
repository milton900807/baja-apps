function (pt, function_table, column) {

    let editor;
    let innerComponentCallback = createIon((_panel) => {
        editor = _panel;
        if (editor) {
            editor.setContent('')
        }
    })
    let editor2;
    let innerComponentCallback2 = createIon((_panel) => {
        editor2 = _panel;
    })

    let c1 = {
        wid: 'card',
        data: {
            cards: [
                [

                    {
                        'width': '100%',
                        'component':
                        {
                            wid: 'html',
                            data: `<hr>`
                        }
                    },
                    {
                        'width': '100%',
                        'component':
                        {
                            wid: 'text-editor',
                            refCallback: innerComponentCallback,
                            componentRef: 'bottomPanel',
                            data: {
                                height: '50px',
                                editorOptions: { language: 'bajabio', automaticLayout: true },
                                objects: pt.root,
                                keybinding: {
                                    'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {

                                    })
                                },
                            }
                        }
                    },

                    {
                        'title': null, 'body': `      `,
                        'width': '100%',
                        'component':
                        {
                            wid: 'button',
                            componentRef: 'bottomPanel2',
                            data: [
                                {
                                    'label': 'Run', ionfunction: createIonFunction(async () => {
                                        let activeContent = editor.getActiveTabContent();
                                        let v = await exec('baja/plate/ops/frun-fun.js', activeContent.trim(), pt);

                                        editor2.setContent(v.join('\n'));
                                    }), disableAfterClick: false
                                },
                                {
                                    'label': 'Apply', ionfunction: createIonFunction(async () => {
                                        let activeContent = editor.getActiveTabContent();
                                        let v = await exec('baja/plate/ops/frun-fun.js', activeContent.trim(), pt);
                                        editor2.setContent(v.join('\n'));
                                        let f = {
                                            expression: activeContent.trim()
                                        }
                                        function_table.addColumnFunction(f, pt)
                                        CurrentLayout.reset('mainPanel')
                                    }), disableAfterClick: false
                                },
                                {
                                    'label': 'Clear', ionfunction: createIonFunction(() => {
                                        editor2.setContent('')
                                    }), disableAfterClick: false
                                },
                                {
                                    'label': 'Close', ionfunction: createIonFunction(() => {
                                        CurrentLayout.reset("mainPanel")
                                    }), disableAfterClick: false
                                }

                            ]
                        }
                    },
                    {
                        'title': ' ', 'body': `
                                            `,
                        'width': '100%',
                        'component':
                        {
                            wid: 'text-editor',
                            refCallback: innerComponentCallback2,
                            componentRef: 'bottomPanel2',
                            data: {
                                height: '450px',
                                editorOptions: { language: 'text', automaticLayout: true },
                            }
                        }
                    }
                ]]
        }
    }
    CurrentLayout.setComponent("mainPanel", c1)

}
