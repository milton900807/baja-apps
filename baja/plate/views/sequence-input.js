function (sequenceListListener) {

    let sequenceTextEditor;
    let descHook = createIonFunction((p) => {
        sequenceTextEditor = p;
    });
    let sequence_input = {
        wid: 'card',
        data: {
            "style.padding-top": '1px',
            "style.border": '1px',
            cards: [
                [
                    {
                        'width': '100%',
                        'component': {
                            wid: 'text-editor',
                            refCallback: descHook,
                            data: {
                                editorOptions: { language: 'text', automaticLayout: true },
                                keybinding: {
                                    'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                    })
                                },
                                height: '300px'
                            }
                        }
                    },
                    {
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Apply', ionFunction: createIonFunction(async () => {
                                            let seqlist = sequenceTextEditor.code.split('\n')
                                            if (sequenceListListener)
                                                sequenceListListener.setSequences(seqlist)
                                            await hideAllModal();
                                        })
                                    }]
                            }
                        }
                    }
                ]]
        }
    }
    return sequence_input;
}
