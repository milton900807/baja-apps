function (libid) {
    let sharepointConfig = { 'scope': ['User.Read', 'Files.ReadWrite', 'Files.ReadWrite.All'] };
    return new Promise(async (resolve, reject) => {

        const SIRNA = await exec('flexigraph/sirna.js')
        const ASO = await exec('baja/chem/structure/ASO.js')
        let MSGraph = await exec('lib/msgraph.js')

        class ChemTemplateDB {
            path = `/drives/${libid}/items:/bajabio-xfiles/.chem:/children`
            load = async () => {
                let templates = {}
                let client = await MSGraph.getClient(sharepointConfig);
                let res = await client.api(this.path).get();
                let files = res['value']
                for (let f of files) {
                    let mol = await this.loadChem(f);
                    let name = f['name']
                    if (name.endsWith('.json')) {
                        name = name.substring(0, name.lastIndexOf('.'))
                    }
                    templates[name] = mol
                }
                return templates;

            }

            save = async (ds, filename) => {
                let client = await MSGraph.getClient(sharepointConfig);
                console.log('path ' + `/drives/${libid}/items:/bajabio-xfiles/.chem`);
                let filepath = await client.api(`/drives/${libid}/items:/bajabio-xfiles/.chem`).get();

                let folderid = filepath.id;
                if (!filename)
                    filename = 'chem-template.json'

                var blob = new Blob([JSON.stringify(ds, (key, value) => {
                    console.log(" key " + key);
                    if (key == "img") {
                        return 'b64';
                    } else if (key == 'canvas') {
                        return null;
                    }
                    else {
                        return value;
                    }
                })], { type: 'application/json' });
                let chem_desc = `/drives/${libid}/items/${folderid}:/${filename}:/content`
                try {
                    await client.api(chem_desc)
                        .put(blob);
                } catch (exception) {
                    console.log(exception);
                }
            }

            folderExists = async (path) => {
                let filepath = `/drives/${libid}/items:/bajabio-xfiles/${path}`;
                let client = await MSGraph.getClient(sharepointConfig);
                try {
                    let folder = await client.api(filepath).get();
                    if (folder['folder']) {
                        return folder;
                    }
                } catch (exception) {
                    console.log(exception)
                    return null;
                }
                return null;
            }
            loadChem = async (file) => {
                let molObject

                if (!file['@microsoft.graph.downloadUrl']) {
                    let client = await MSGraph.getClient(sharepointConfig);

                    let filename = file['name']
                    if (filename != null && filename.length > 0) {
                        console.log('debubg');
                        let p = `/drives/${libid}/root:/bajabio-xfiles/.chem/${filename}`;
                        file = await client.api(p).get();
                    }
                    else {
                        let filepath = await client.api(`/drives/${libid}/root:/bajabio-xfiles/.chem/${file}`).get();
                        file = await client.api(filepath).get();
                    }
                }
                if (file && file['@microsoft.graph.downloadUrl']) {
                    molObject = await GETJSON(file['@microsoft.graph.downloadUrl'])
                } else if (file.sense && file.antisense) {
                    molObject = file;
                }
                return molObject;

            }

            createMoleculeObject = async (obj) => {
                let keys = Object.keys(obj);
                if (obj.molType) {
                    if (obj.molType === 'ASO')
                        return new ASO(obj);
                    else if (obj.molType === 'siRNA')
                        return new SIRNA(obj);
                } else {
                    if (obj['antisense'] != null && obj['sense'] != null) {
                        return new SIRNA(obj);
                    }
                    else {
                        return new ASO(obj);
                    }
                }
            }
        }
        resolve(ChemTemplateDB);
    })
}
