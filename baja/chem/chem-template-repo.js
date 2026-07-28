function () {
    return new Promise(async (resolve, reject) => {
        const SIRNA = await exec('flexigraph/sirna.js')
        const ASO = await exec('baja/chem/structure/ASO.js')
        class ChemTemplateDB {
            path = `/`
            load = async () => {
                let host_ = window['env']['apiUrl']
                let rs = await GETJSON(host_ + '/load-files?key=config&path=chemistry' + this.path);
                return rs;
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
