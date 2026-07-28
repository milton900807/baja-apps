function () {

    let path = `tracks/default.ini`
    let default_ini = `/drives/${libid}/items:/bajabio-xfiles/${path}:/content`;
    try {
        await client.api(default_ini)
            .put(blob);
    } catch (exception) {
        console.log(exception);
    }

    folderExists = async (path) => {
        let filepath = `/drives/${libid}/items:/bajabio-xfiles/${path}`;
        let client = await MSGraph.getClient(sharepointConfig);

        let text_editor = {
            wid: 'text-editor',
            data: {
                editorOptions: { language: 'javascript', automaticLayout: true },
                libs: [
                ],
                keybinding: {
                    'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                        let line = content.trim();
                        if (content.indexOf('\n') > 0) {
                            let sp = content.split('\n')
                            line = sp[lineNumber - 1]
                        }
                    })
                },
                height: '300px',
                width: '800px'
            }
        }
        let cardv = {
            wid: 'card',
            data: {
                'padding': '10px',
                cards: [
                    [
                        {
                            'title': '', 'body': ` `,
                            'width': '100%',
                            'height': '100px',
                            'component': { wid: 'html', componentRef: 'gene-graph', data: 'Ini file' }
                        },
                        {
                            'title': '', 'body': ` `,
                            'width': '100%',
                            'height': '100px',
                            'component': text_editor
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Save', ionFunction: createIonFunction(() => {

                                            })
                                        },
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                hideAllModal();
                                            })
                                        }
                                    ]
                                }
                            }
                        }

                    ]
                ]
            }
        }

        showModal(cardv, 800, 200);
    }
