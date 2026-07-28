function (library, editor) {

    let sharepoint_config = {
        'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
            'Sites.ReadWrite.All']
    }

    exec('lib/msgraph.js').then(async MSGraph => {
        let folderpath = `/drives/${library.id}/root:/bajabio-xfiles/.chem`
        showModal({
            wid: 'folder-browser',
            data: {
                height: '600px',
                path: folderpath,
                "ionfunction.folderadded": createIonFunction(async (folder) => {

                }),
                "ionfunction.openfile": createIonFunction(async (file, text) => {

                }),
                "ionfunction.path": createIonFunction(async (file, nodes) => {
                    if (!file['folder']) {

                        if (!file['@microsoft.graph.downloadUrl']) {
                            console.log('debubg');
                            let client = await MSGraph.getClient(sharepoint_config);
                            let filepath = `/drives/${library.id}/items/${file.id}`;
                            file = await client.api(filepath).get();
                        }

                        if (file['@microsoft.graph.downloadUrl']) {
                            let molObject = await GETJSON(file['@microsoft.graph.downloadUrl'])

                            editor.editorOptions = { language: 'json', automaticLayout: true };

                            editor.setContent(JSON.stringify(molObject))
                        }
                    }

                })
            }
        })
    })
}
