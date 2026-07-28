function () {
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
                            data: ' <hr> '
                        }
                    },
                    {
                        'width': '100%',
                        'heght': '100%',
                        'component': {
                            wid: 'json',
                            refCallback: jdescHook,
                            data: {
                                height: "450px",
                                showButton: false,
                                keybinding: {
                                    'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                        jsonPanel.format();
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
                                        label: 'Pull', ionFunction: createIonFunction(async () => {
                                            let host_ = window['env']['apiUrl']
                                            let rf = await POSTJSON({}, host_ + `/git-pull-current-branch`)
                                            jsonPanel.setData(JSON.stringify(rf));

                                        })
                                    },
                                ]

                            }

                        }
                    }
                ]]
        }
    }

    showWidget(sequence_input)

}
