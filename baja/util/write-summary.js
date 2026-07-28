function (experiment_id, driveid, folderid, experiment_type, descJSON) {
    return new Promise(async (resolve, reject) => {
        let MSGraph = await exec('lib/msgraph');
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
                'Sites.ReadWrite.All']
        }
        let client = await MSGraph.getClient(sharepoint_config);

        let b = await writeExperiment(experiment_id, descJSON)
        let filename = experiment_id + '.docx'
        var blob = new Blob([b], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        let path = `/drives/${driveid}/items/${folderid}:/${filename}:/content`;
        try {
            let v = await client.api(path)
                .put(blob);
            resolve(v)
        } catch (exception) {
            console.log(exception);
            reject ( null )
        }
    })
}
