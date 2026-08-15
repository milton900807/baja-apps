function () {
    return new Promise(async (resolve, reject) => {
        let list = []
        let db = await exec('baja/lib/db.js');
        let MSGraph = await exec('lib/msgraph.js')

        let sharepointConfig = { 'scope': ['User.Read', 'Files.ReadWrite', 'Files.ReadWrite.All'] };
        let client = await MSGraph.getClient(sharepointConfig)
        let published_menus = await db.list(`bajabio-screens/.algorithms/.published`);

        let v = published_menus['value']
        for (let item of v) {
            list.push({ 'name': item['name'], 'path': item['parentReference']['path'], 'fileId': item['id'], '@microsoft.graph.downloadUrl': item['@microsoft.graph.downloadUrl'] })
        }

        list.push({
            label: 'Test', ionfunction: createIonFunction(async () => {

            })
        })
        resolve(list);
    })
}
