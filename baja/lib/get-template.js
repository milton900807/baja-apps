function (libraryID, templateName) {

    return new Promise(async (resolve, reject) => {
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All']
        }
        let client = await MSGraph.getClient(sharepoint_config);
        let path = `/drives/${libraryID}/items/root:/${templateName}`
        console.log ( path )
        let res = await client.api(path).get();
        resolve({
            file_type: '.xlsx',
            id: res['id']
        })
    })
}
