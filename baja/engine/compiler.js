function (library) {

    return new Promise(async (resolve, reject) => {
        let MSGraph = await exec('lib/msgraph.js');
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read'
            ]
        }
        let client = await MSGraph.getClient(sharepoint_config);

        let parseArguments = (p) => {
            p = p.trim();
            let i = p.indexOf('(');
            let f = p.indexOf(')');
            p = p.substring(i + 1, f);

            p = p.trim();
            if (p.length == 0) {
                return [];
            }
            let s = [];
            p = p.trim();
            if (p.length > 0) {
                let sp = p.split(',');
                if (sp != null && sp.length > 0) {
                    for (let ssp of sp) {
                        s.push(ssp);
                    }
                }
            }
            return s;
        }

        let parseFunctionBody = (functionstr) => {

            let startIndex = functionstr.indexOf('{')
            let endIndex = functionstr.lastIndexOf('}')
            return functionstr.substring(startIndex + 1, endIndex)

        }

        let parseArgumentsFromFunction = (hr) => {
            hr = hr.trim();
            let startIndex = hr.indexOf('(')
            let endIndex = hr.indexOf(')')
            let argumentsLine = hr.substring(startIndex, endIndex + 1);
            let function_arguments = parseArguments(argumentsLine);
            return function_arguments;
        }

        let loadFunc = async (path, folder, objd) => {
            if (folder['folder']) {
                let list = `/drives/${library.id}/items/${folder.id}/children`;
                let cfolder = await client.api(list).get();
                let values = cfolder.value;
                console.log(" path " + path)
                for (let v of values) {
                    return await loadFunc(path + '.' + v['name'], v, objd)
                }
            } else {
                if (folder && folder['@microsoft.graph.downloadUrl']) {
                    let molObject = await GETXT(folder['@microsoft.graph.downloadUrl'])
                    objd[path + '.' + folder['name']] = molObject;
                }

            }
            return objd;
        }

        let list = `/drives/${library.id}/root:/bajabio-xfiles/.functions/factory/compounds`;
        let folder = await client.api(list).get();
        let d = {}
        d = await loadFunc('compounds', folder, d)
        class LJLFunctions {
            compoundFactories = {};
            compoundFilters = {}
        }
        let l = new LJLFunctions();
        let keys = Object.keys(d);
        for (let k of keys) {
            let value = d[k];
            let functionArguments = parseArgumentsFromFunction(value);
            let body = parseFunctionBody(value);
            var func = new Function(functionArguments, body);
            l.compoundFactories[k] = createIonFunction(func);
        }
        resolve(l)
    })

}
