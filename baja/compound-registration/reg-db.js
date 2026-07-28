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
            let client = await MSGraph.getClient(sharepoint_config);
            let idt = await exec('baja/chem/structure/idt/idt-format.js');
            let sheetname = 'main'
            let file = await client.api(`/drives/${libid}/root:/bajabio-xfiles/registration.xlsx`).get();
            let fileid = file['id'];
            let temp = `/drives/${libid}/items/${fileid}/workbook/worksheets/${sheetname}/range(address='B2')`
            let sheetObject = await client.api(temp).get();

            let row = 1;
            let rows = []
            try {
                let index = 8;
                rows.push({
                    "well": "Position",
                    "sequence_name": "Name",
                    "sequence": "Sequence"
                })

                for (let i = 0; i < oligos.length; i++) {

                    let o = oligos[i]
                    let well = String.fromCharCode(65 + 8 - index) + '' + row
                    rows.push({

                        "well": well,
                        "sequence_name": o.id,
                        "sequence": idt.format(o.structure),
                        "scale": "1 umole MOE oligo",
                        "Purification": "Standard Desalting",
                        "Normalization": "Full Yield",
                        "Plate_Type": "Deep Well"
                    })
                    if (row >= 10) {
                        row = 1;
                        index--;
                    } else
                        row++;
                    if (index <= 0) {
                        index = 8;
                    }

                }
            } catch (exception) {
                console.log(" Save complete ")
                return
            }
            resolve(rows)
        })

    })
}
