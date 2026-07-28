function (graph) {

    let panel;
    const __nameHook = createIonFunction((hook) => {
        panel = hook;
    })
    let bookmarks = graph.bookmarks;
    let bookm = Object.keys(bookmarks);
    return {
        wid: 'card',
        data: {
            'style.padding-left': '12px',
            cards: [
                [
                    {
                        'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.`,
                        'width': '90%',
                        'component':
                        {
                            wid: 'input-param-items',
                            refCallback: __nameHook,
                            data: {
                                'input_labels': ['Bookmark name'],
                            }
                        }
                    },
                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Save', ionFunction: createIonFunction(async () => {
                                            let name = panel.get('Bookmark name')
                                            if (name == null || name.length <= 0) {
                                                alert(' Provide a name or cancel ')
                                                return;
                                            }
                                            graph.setBookmark(name);
                                            hideAllModal();
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
                ]]
        }
    }

}
