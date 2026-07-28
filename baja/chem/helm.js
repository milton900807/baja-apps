function () {

    return new Promise(async (resolve, reject) => {
        function parseChainInfo(inputString) {
            let regex = /(\w+)\{(.+?)\}/;
            let match = inputString.match(regex);
            if (match) {
                let chainID = match[1];
                let chain = match[2];
                return { chainID, chain };
            } else {
                return null;
            }
        }
        function convertHELMtoIDT(HELMString) {
            let componentMappings = {
                "m": "m",
                "r": "r",
                "d": "r",
                "sp": "*",
                "fl2r": "/52F/",
                "fl2l": "/32F/",
                "fl2i": "/i2F/",
                "A": "A",
                "C": "C",
                "G": "G",
                "T": "T"
            };
            let chains = parseHELMChains(HELMString);
            let idtChains = [];
            for (let i = 0; i < chains.length; i++) {

                let chainInfo = parseChainInfo(chains[i])
                let idtChain = "";
                let chainID = chainInfo["chainID"]
                let RNAString = chainInfo["chain"]
                let components = RNAString.split('.');
                for (let j = 0; j < components.length; j++) {
                    let component = components[j];
                    let parts = component.match(/(\w+)(?:\(([^)]+)\))?/);
                    console.log(parts + ' pasrts ')
                    console.log(component)
                    let base = component.match(/\(([^)]+)\)/)[0];
                    base = base.replace(/[^a-zA-Z0-9]/g, '');
                    let monomer = parts[1];

                    let idtComponent = componentMappings[monomer];
                    console.log(base)
                    if (monomer.startsWith("fl2")) {
                        if (j === 0) {
                            idtComponent = `/52F${base}/`;
                        } else if (j === components.length - 1) {
                            idtComponent = `/32F${base}/`;
                        } else {
                            idtComponent = `/i2F${base}/`;
                        }
                        idtChain += idtComponent;

                    } else {

                        idtChain += idtComponent + base;
                    }

                    if (component.includes('[sp]')) {
                        idtChain += '*';
                    }
                }
                let idt = idtChain
                idtChain = idtChain.replace(/\/\//g, '/');
                idtChains.push({ chainID, idt });
            }
            return idtChains;
        }

        function parseHELMChains(HELMString) {
            console.log('debubg');
            let index = HELMString.indexOf('$')
            if (index > 0)
                HELMString = HELMString.substring(0, index);
            return HELMString.split('|');
        }

        resolve({ parseHELMChains, convertHELMtoIDT })
    })
}
