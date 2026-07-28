function (graph, library, folder) {
    return new Promise(async (resolve, reject) => {
        let libid = library.id;
        folderid = folder.id;

        let items = [
            {
                label: 'Find',
                ionfunction: createIonFunction(async () => {
                    await exec('baja/screens/annotation/find.js', library, folder.id, graph);
                })
            }
        ]
        let f = {
            label: 'Annotations', 'items': items
        }
        return resolve(f)
    })
}
