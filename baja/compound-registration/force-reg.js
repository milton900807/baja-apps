function (libid, poligos, graph) {

    return new Promise(async (resolve, reject) => {
        exec('lib/msgraph.js').then(async MSGraph => {
            let sharepoint_config = {
                'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite',
                    'Files.ReadWrite.All', 'Sites.Read.All', 'Sites.ReadWrite.All', 'https://graph.microsoft.com/Sites.ReadWrite.All']
            };
            let client = await MSGraph.getClient(sharepoint_config);
            let verify = async (path) => {
                console.log(" path " + path);
                let ps = path.split('/')
                let pth = ''
                let f = null;
                for (let p of ps) {
                    pth += '/' + p
                    f = await mkdirs(pth)
                }

                return f;
            }
            let mkdirs = async (path) => {
                client = await MSGraph.getClient(sharepoint_config);
                try {
                    if (path == null || path.length <= 0) {
                        return null;
                    }
                    if (path.startsWith('/')) {
                        path = path.substring(1);
                    }

                    let filepath = `/drives/${libid}/root:/bajabio-xfiles/${path}`;
                    let f = await client.api(filepath).get();
                    return f;
                } catch (e) {
                    try {
                        let folderpath = `/drives/${libid}/root:/bajabio-xfiles/${path}:/children`;

                        let foldername = path.substring(path.lastIndexOf('/') + 1)
                        let parentfolder = path.substring(0, path.lastIndexOf('/'))
                        parentfolder = `/drives/${libid}/root:/bajabio-xfiles/${parentfolder}:/children`

                        let new_exp_dir = {
                            "name": foldername,
                            "folder": {
                            },
                            "@microsoft.graph.conflictBehavior": "fail"
                        }

                        console.log('debubg');
                        let folder = await client.api(parentfolder)
                            .post(new_exp_dir)
                            .catch(error => {
                                console.log(error)

                            })

                        return folder;

                    } catch (ee) {
                        console.log('debubg');
                        let parent = path.substring(0, path.lastIndexOf('/'))
                        return verify(parent);
                    }
                }
            }

            let oligos = []
            let already_registered_oligos = []
            for (let po of poligos) {
                if (!po.libID) {
                    oligos.push(po)
                } else {
                    already_registered_oligos.push(po)
                }
            }

            if (already_registered_oligos.length > 0) {
                graph.setMessage(already_registered_oligos.length + "/" + poligos.length + " already registered.")
            }

            let sheetname = 'main'
            let sheetname2 = 'Sheet1'
            let file = await client.api(`/drives/${libid}/root:/bajabio-xfiles/registration.xlsx`).get();
            let fileid = file['id'];
            try {
                let path = `/drives/${libid}/items/${fileid}`
                let temp = `/drives/${libid}/items/${fileid}/workbook/worksheets/${sheetname}/range(address='B1')`
                let sheetObject = await client.api(temp).get();
                let startIndex = sheetObject['values'][0][0];
                let numOligos = oligos.length;

                if (numOligos <= 0) {
                    graph.setMessage(" Nothing to register. ")
                    return;
                }
                let progressBar;
                let w = {
                    wid: 'progress', data: {
                        'progress': 0,
                        'progressBar': createIonFunction((progessBar) => {
                            progressBar = progessBar;
                        })
                    }
                }
                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                CurrentLayout.setComponent('buttonMenuPanel', w)

                let endIndex = startIndex + numOligos
                let j = {
                    'values': [[endIndex]]
                }
                let compoundSheet = `/drives/${libid}/items/${fileid}/workbook/worksheets/${sheetname2}`
                sheetObject = await client.api(compoundSheet).get();
                let updateResponse = await client.api(temp).update(j);
                graph.setMessage(" Registering " + startIndex + "..." + endIndex)
                let sheetPath = `/drives/${libid}/items/${fileid}/workbook/tables/Table1/rows`
                try {
                    if (updateResponse.values[0][0] == startIndex) {
                        sheetObject = await client.api(sheetPath).get();
                    }
                }
                catch (ex) {

                    const workbookTable = {
                        name: 'Compounds',
                        showTotals: true,
                        address: 'Sheet1!A1:D4',
                        hasHeaders: true,
                        style: 'style-value'
                    };
                    sheetObject = await client.api(`/drives/${libid}/items/${fileid}/workbook/tables/add`).post(workbookTable);
                }

                let lastRow = `/drives/${libid}/items/${fileid}/workbook/tables/Table1/range/lastRow`
                sheetObject = await client.api(lastRow).get();
                for (let i = 0; i < oligos.length; i++) {

                    let o = oligos[i]
                    if (!o.libID) {
                        o.libID = libid + 'lj' + o.id + 'T' + (new Date())

                        let str = o.structure.replaceAll('[', '_')
                        str = str.replaceAll(']', '_')
                        str = str.replaceAll('{', '_')
                        let filename = str + '' + o.id + '.json'

                        let prefix = o.sequence.substring(0, 4)
                        o.id = i + startIndex;

                        let folder = await verify(`reg/${o.type}/${prefix}/${o.sequence}`);
                        let folderid = folder.id;
                        let parentpath = `/drives/${libid}/items/${folderid}`
                        var blob = new Blob([JSON.stringify(o, (key, value) => {
                            return value;
                        })], { type: 'application/json' });
                        console.log(" Saving to " + path + " file size : " + blob.size);
                        MSGraph.saveLG(blob, filename, parentpath, () => {

                        })

                        progressBar(i / numOligos * 100)
                        console.log(" Save complete ")

                    }
                }

                graph.setMessage(' Registration complete ')

                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                CurrentLayout.setComponent('buttonMenuPanel', {
                    'wid': 'html',
                    data: ` <h2> ${numOligos} compounds registered. </h2> `
                })

                console.log('debubg');
                return resolve(oligos)

            } catch (exception) {
                console.log(exception)
            }
        })
    })

}
