function (libid, poligos, graph) {
    return new Promise(async (resolve, reject) => {
        exec('lib/msgraph.js').then(async MSGraph => {
            let oligos = []
            for (let o of poligos) {
                if (!o.libID) {
                    graph.setMessage("Contains unregistered oligos.")
                    return;
                }
                oligos.push(o)
            }
            graph.setMessage(" Exporting IDT manifest")
            let sharepoint_config = { 'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All', 'Sites.ReadWrite.All', 'https://graph.microsoft.com/Sites.ReadWrite.All'] };

            let folder = await verify(`reg/${o.type}/${prefix}/${o.sequence}`);
            let parentpath = `/drives/${libid}/items/${folderid}`
            let client = await MSGraph.getClient(sharepoint_config);
            let d = await client.api(parentpath).get();

            showWidget ( {
                wid:'json',
                data:JSON.stringify ( d )
            })

            for (let i = 0; i < oligos.length; i++) {
                let o = oligos[i]
                let sequence = idt.format(o.structure),

            }
            resolve(rows)
        })

    })
}
