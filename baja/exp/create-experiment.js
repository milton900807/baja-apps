function (driveid, folderid, type, jsonObject) {
    return new Promise(async (resolve, reject) => {

        const dbhost = window["env"]["db"];
        if (dbhost) {

            console.log('debubg');

            let r = await POSTJSON({ 'user': getUser(), 'name': jsonObject['title'], 'description': jsonObject['summary'], 'path': '/drives/' + driveid + '/items' + folderid }, `${dbhost}/create_experiment`);
            let expid = r.id;
            let experimentFolderId = folderid
            experiment_summary = await exec('baja/util/write-summary.js', expid, driveid, experimentFolderId, type, jsonObject);
            await exec('baja/util/copy-template.js', driveid, 'status.xlsx', experimentFolderId);
            await exec('baja/util/copy-template.js', driveid, 'gene-graph.xlsx', experimentFolderId);
        } else {
            resolve(null);
        }
        resolve(experiment_summary);
    })
}
