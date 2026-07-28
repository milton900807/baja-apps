function (libid) {

    return new Promise(async (resolve, reject) => {
        let genomes = []
        let MSGraph = await exec('lib/msgraph.js')
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
                'Sites.ReadWrite.All']
        }
        let failed_to_load = false;
        let client = await MSGraph.getClient(sharepoint_config);

        let filepath = `/drives/${libid}/root:/bajabio-xfiles/off-targets/active-indicies.json`
        try {
            let file = await client.api(filepath).get();
            if (file['@microsoft.graph.downloadUrl'] != null) {
                let jdata = await GETJSON(file['@microsoft.graph.downloadUrl'])
                genomes = jdata;
            }

        } catch (exception) {
            log(' Warning:  Active genomes not found.. so using default')
            console.log(exception.toString())
            failed_to_load = true;
        }

        if (failed_to_load) {

            genomes = [
                'Homo_sapiens.GRCh38.dna.gene',
                'Homo_sapiens.GRCh38.88.3utr',
                'Homo_sapiens.GRCh38.88.mRNA.fw'
            ]

        }

        resolve(genomes);
    })

}
