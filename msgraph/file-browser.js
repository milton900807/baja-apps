function () {

    let library = {
    }

    let currentPath = null;

    showWidget({
        wid: 'folder-browser',
        width: 1000,
        data: {
            width: 800,
            path: '/me/drive/root',

            "ionfunction.openfile": createIonFunction(async (file, text) => {
            }
            )
            ,
            "ionfunction.path": createIonFunction(async (path, nodes) => {
                currentPath = path;

                if (path.name.endsWith('txt')) {
                    let sharepointConfig = { 'scope': ['User.Read', 'Sites.Read.All', 'Sites.ReadWrite.All'] };
                    let client = await MSGraph.getClient(sharepointConfig);
                    let fileobject = await client.api(`/drives/${library.id}/items/${path.id}`).get();

                    let text = await GETXT(fileobject['@microsoft.graph.downloadUrl'])

                    showWidget({
                        wid: 'json',
                        data: text
                    })

                }

            })
        }
    })

}
