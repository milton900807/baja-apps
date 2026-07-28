function (genegraph_panel_layout) {
    let sequenceTextEditor;
    let descHook = createIonFunction((p) => {
        sequenceTextEditor = p;
    });
    let jsonPanel;
    let jdescHook = createIonFunction((p) => {
        jsonPanel = p;
    });

    function parseCommands(text) {
        const lines = text.split('\n');
        const commands = lines.map(line => {
            const [command, ...args] = line.trim().split(' ');
            return {
                command,
                args: args.join(' ')
            };
        });
        return commands;
    }

    let sequence_input = {
        wid: 'card',
        data: {
            "style.padding-top": '1px',
            "style.border": '1px',
            "style.height": "500px",
            cards: [
                [
                    {
                        'width': '100%',
                        'component': {
                            wid: 'html',
                            data: ' Requirements'
                        }

                    },
                    {
                        'component': {
                            wid: 'text-editor',
                            refCallback: descHook,
                            data: {
                                width: "500px",
                                height: "50px",
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
                        'width': '100%',
                        'heght': '100%',
                        'component': {
                            wid: 'json',
                            refCallback: jdescHook,
                            data: {
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
                        'width': '100%',
                        'component': {
                            wid: 'html',
                            data: '<hr>'
                        }
                    },
                    {
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Install Library', ionFunction: createIonFunction(async () => {
                                            let value = sequenceTextEditor.code

                                            jsonPanel.setData('downloading lib... ');

                                            let c = value.split('\n')
                                            for (let command of c) {
                                                let host_ = window['env']['apiUrl']
                                                let rf = await GETJSON(host_ + `/install-py?pym=${command}`)
                                                value += '\n' + rf.output;
                                            }
                                            jsonPanel.setData(value);
                                        })
                                    },
                                    {
                                        label: 'Install Apps', ionFunction: createIonFunction(async () => {
                                            let value = sequenceTextEditor.code
                                            let c = value.split('\n')
                                            let b = {
                                                cmds: c,
                                                user: getUser()
                                            }
                                            let host_ = window['env']['apiUrl']
                                            let rf = await POSTJSON(b, host_ + `/git`)
                                            jsonPanel.setData(rf);
                                            setTimeout(() => {
                                                jsonPanel.format();

                                            }, 1000)

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
                    }
                ]]
        }
    }

    showWidget(sequence_input)

}
