function () {
    let graph;
    let io;
    let folders;

    exec('flexigraph/gene.js').then(async (geneGraph) => {
        graph = geneGraph;
        let html = '';

        io = await showWidget({
            wid: 'text-editor',
            data: {
                editorOptions: { language: 'text', automaticLayout: true },
                height: '100px',
                border: false,
                lineNumbers: createIonFunction((t) => {
                    return '[' + t + ']';
                })
            }
        })
        let button1 = await showWidget({
            wid: 'button',
            data: {
                label: 'Save',
                disableAfterClick: false,
                ionfunction: createIonFunction(() => {

                    let content = io.getContent();
                    let count = folders.getCount();
                    folders.add({
                        'name': count + '',
                        'value': content
                    })

                })
            }
        })
        folders = await showWidget({
            wid: 'icon-canvas',
            data: {
                'height': 100,
                'ymax': 2,
                'click': createIonFunction((content) => {
                    if (content['value'] != null)
                        io.setContent(content['value']);

                }),
                'save': createIonFunction((id, content) => {

                })

            }
        })
        showWidget({
            wid: 'text-editor',
            data: {
                editorOptions: { language: 'javascript', automaticLayout: true },
                libs: [
                    { 'name': 'core', 'path': 'genome/lib/core.js' },
                    { 'name': 'sample', 'path': 'genome/sample-gff.js' }
                ],
                height: '200px'
            }
        }).then(async (editor) => {
            let button = await showWidget({
                wid: 'button',
                data: {
                    label: 'Run',
                    disableAfterClick: false,
                    ionfunction: createIonFunction(() => {
                        editor.exec({ "name": "graph", "object": graph }, { "name": "io", "object": io });
                    })
                }
            })
        })
    })

}
