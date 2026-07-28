function (experimentid, title, summary, author) {
    return new Promise(async (resolve, reject) => {

        let t = async (experimentid, client) => {
            let b = await docx(experimentid, title, summary, author)
            console.log("************************************* " + experimentid);
            let filename = experimentid + '.docx'
            var blob = new Blob([b], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            let eln_summary_doc = '/me/drive/root:/bajabio-screens/' + experimentid + '/' + filename + ':/content'
            console.log(eln_summary_doc)
            return await client.api(eln_summary_doc)
                .put(blob);
        }
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All']
        }
        let client = await MSGraph.getClient(sharepoint_config);
        let r = await t(experimentid, client)
        resolve(r);
    })

}
