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
        // Map one HELM monomer (sugar symbol + base) to its IDT code, given its
        // position in the strand (5' end / internal / 3' end matters for some
        // modifications). Unknown sugars fall back to the bare base — NEVER "undefined".
        function monomerToIDT(sugar, base, isFirst, isLast) {
            const b = ('' + base).toUpperCase();
            const s = ('' + sugar).toLowerCase();
            switch (s) {
                case 'd': case '': return b;                          // DNA — base only
                case 'r': return 'r' + b;                             // RNA
                case 'm': return 'm' + (b === 'T' ? 'U' : b);         // 2'-OMe (T->U)
                case 'lna': case 'l': case '+': return '+' + b;       // LNA
                case 'f': case '2f': return 'f' + b;                  // 2'-F
                case 'fl2r': case 'fl2l': case 'fl2i': case 'fl2': {  // 2'-F (legacy position codes)
                    const code = isFirst ? '52F' : isLast ? '32F' : 'i2F';
                    return '/' + code + b + '/';
                }
                case 'moe': {                                         // 2'-MOE (T->U)
                    const bb = (b === 'T') ? 'U' : b;
                    const code = isFirst ? '52MOEr' : isLast ? '32MOEr' : 'i2MOEr';
                    return '/' + code + bb + '/';
                }
                default: return b;                                    // unknown -> base only
            }
        }

        function convertHELMtoIDT(HELMString) {
            let chains = parseHELMChains(HELMString);
            let idtChains = [];
            for (let i = 0; i < chains.length; i++) {
                let chainInfo = parseChainInfo(chains[i]);
                if (!chainInfo) continue;
                let chainID = chainInfo["chainID"];
                let RNAString = chainInfo["chain"];
                let components = RNAString.split('.');

                // First pass: extract (sugar, base, ps-after) for every real monomer,
                // skipping pure linker tokens.
                const units = [];
                for (let j = 0; j < components.length; j++) {
                    const comp = components[j];
                    // sugar symbol: a bracketed [xxx] monomer, else the word before '('
                    let sugar = '';
                    const mBracket = comp.match(/\[([^\]]+)\]\s*\(/);
                    if (mBracket) sugar = mBracket[1];
                    else { const mBare = comp.match(/([A-Za-z0-9']+)\s*\(/); if (mBare) sugar = mBare[1]; }
                    // base inside the parentheses
                    const mBase = comp.match(/\(([^)]+)\)/);
                    if (!mBase) continue;   // a linker-only token (e.g. "[sp]") — handled below
                    const base = mBase[1].replace(/[^a-zA-Z0-9]/g, '');
                    // phosphorothioate if the token carries an sp linker
                    const ps = /\[?sp\]?/.test(comp);
                    units.push({ sugar, base, ps });
                }

                // Second pass: build the IDT string, inserting '*' for PS linkages.
                let idt = '';
                for (let j = 0; j < units.length; j++) {
                    const u = units[j];
                    idt += monomerToIDT(u.sugar, u.base, j === 0, j === units.length - 1);
                    if (j < units.length - 1) {
                        const ps = u.ps || (units[j + 1] && units[j + 1].ps);
                        if (ps) idt += '*';
                    }
                }
                idt = idt.replace(/\/\//g, '/');
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
