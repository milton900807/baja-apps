function (graph) {

    let v = '';
    let panel;
    const __nameHook = createIonFunction((hook) => {
        panel = hook;
    })

    let bookmarks = graph.bookmarks;
    if (!bookmarks) {
        bookmarks = {}
    }
    let bookm = Object.keys(bookmarks);
    if (!bookm) {
        bookm = []
    }

    let jo = {}
    for (let item of bookm) {

    }

    return {
        wid: 'card',
        data: {
            'style.padding-left': '12px',
            cards: [
                [
                    {
                        'width': '900px',
                        'component':
                        {
                            wid: 'json',
                            refCallback: __nameHook,
                            data: JSON.stringify(bookmarks), width: '400px'
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
                                            let bd = JSON.parse ( panel.data )
                                            graph.setBookmarks ( bd );
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
