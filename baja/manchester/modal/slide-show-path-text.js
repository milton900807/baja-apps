function (graph, genegraph_panel_layout) {

    let v = '';
    let panel;
    const __nameHook = createIonFunction((hook) => {
        panel = hook;
    })
    let editor_;
    let editor_function = createIonFunction((editor) => {
        editor_ = editor;
    })

    let bookmarks = graph.bookmarks;
    let bookm = Object.keys(bookmarks);

    let ml = {
        wid: 'multi-select',
        data: {
            'list': bookm,
            'ionfunction': createIonFunction(async (vlist_selected) => {

                let t = {
                    "title": vlist_selected,
                    "file": graph.file.id,
                    "chapter_title": graph.file.name,
                    "type": "Bookmark"
                }

                editor_.code += '\n' + JSON.stringify(t)
            }), showButton: false
        }
    }

    let editorPanel = {
        wid: 'card',
        data: {
            'style.padding-left': '12px',
            cards: [
                [

                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Save', ionFunction: createIonFunction(async () => {

                                            hideAllModal();

                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                        })

                                    },
                                    {
                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                            hideAllModal();
                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                        })
                                    }
                                ]
                            }
                        }
                    },

                    {
                        'title': ' ', 'body': ``,
                        'width': '90%',
                        'component': {
                            wid: 'revolucion',
                            refCallback: editor_function,
                            data: {
                                'height': '800px',
                                ''
                            }

                        }
                    },

                ]]
        }
    }
    return editorPanel;

}
