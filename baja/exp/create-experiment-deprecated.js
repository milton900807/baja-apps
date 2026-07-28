function (driveid, folderid, type, descJSON) {
    return new Promise(async (resolve, reject) => {
        let LibDB = await exec('baja/lib/db.js', driveid)
        let jb = await LibDB.experiment(folderid, descJSON.title);
        let experiment_summary = null;
        if (jb) {
            let expid = jb.values[0][0]
            let experimentFolderId = jb.values[0][1]
            experiment_summary = await exec('baja/util/write-summary.js', expid, driveid, experimentFolderId, type, descJSON);

            await exec('baja/util/copy-template.js', driveid, 'status.xlsx', experimentFolderId);
            await exec('baja/util/copy-template.js', driveid, 'gene-graph.xlsx', experimentFolderId);
        } else {
            resolve(null);
        }
        resolve(experiment_summary);
    })
}
