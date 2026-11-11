function () {

    return new Promise(async (resolve, reject) => {
        let helm = await exec('baja/chem/helm.js')

        class IDT {

            helmToIDT(chain) {
                console.log('debubg');
                if (chain.indexOf('sp[') >= 0) {
                    chain = chain.replace(/sp\[/g, "sp.[")
                }
                if (chain.indexOf('p[') >= 0) {
                    chain = chain.replace(/p\[/g, "p.[")
                }
                let idt = "";
                let index = 0;
                let base;
                let sugar;
                let c = chain.split('.');
                for (let i of c) {
                    i = i.trim();

                    let stindex = i.indexOf('[');
                    let ndindex = i.indexOf(']')
                    if (stindex >= 0) {
                        base = i.substring(stindex + 1, ndindex);
                        sugar = i.substring(ndindex + 1);
                        sugar = sugar.trim();
                        let idt_sugar = this.getSugar(sugar);
                        console.log('debubg');
                        if (idt_sugar.length > 0) {
                            if (idt.length <= 0) {
                                idt = '/5' + idt_sugar + base + '/'
                            }
                            else if (index >= (c.length - 1)) {
                                idt += '/3' + idt_sugar + base + '/'
                            }
                            else
                                if (index < c.length) {

                                    idt += '/' + 'i' + idt_sugar + base + '/'
                                }
                        } else {

                            if (sugar.toLowerCase() === 'd' && base.toLowerCase() === 'c') {

                                idt += '/iMe-dC/'
                            } else
                                idt += base;
                        }
                        console.log('debubg');

                    } else {

                        if (i === 'sp') {
                            idt += '*'
                        }
                    }
                    index++;
                }
                return idt;
            }

            HELMChainToIDT(chain) {
                console.log('debubg');
                let idt = "";
                let index = 0;
                let base;
                let sugar;
                let c = chain.split('.');
                for (let i of c) {
                    i = i.trim();
                    let stindex = i.indexOf('(');
                    let ndindex = i.indexOf(')')
                    if (stindex >= 0) {
                        base = i.substring(stindex + 1, ndindex);
                        sugar = i.substring(0, ndindex);
                        sugar = sugar.trim();
                        let idt_sugar = this.getSugar(sugar);
                        if (idt_sugar.length > 0) {
                            if (idt.length <= 0) {
                                idt = '/5' + idt_sugar + base + '/'
                            }
                            else if (index >= (c.length - 1)) {
                                idt += '/3' + idt_sugar + base + '/'
                            }
                            else
                                if (index < c.length) {
                                    if (!idt.endsWith('/'))
                                        idt += '/'
                                    idt += 'i' + idt_sugar + base + '/'
                                }
                        } else {

                            if (sugar.toLowerCase() === 'd' && base.toLowerCase() === 'c') {
                                if (idt.endsWith('/')) {
                                    idt = idt.substring(0, idt.length - 1)
                                }
                                idt += '/iMe-dC/'
                            } else
                                idt += base;
                        }

                    } else {

                        if (i === 'sp') {
                            idt += '*'
                        }
                    }
                    index++;
                }
                return idt;
            }

            getSugar = (s) => {
                s = s.toLocaleLowerCase();
                if (s === 'moe') {
                    return 'MOEr'
                }
                else if (s === 'lna') {
                    return '+'
                }
                else if (s === 'd') {
                    return '';
                } else {
                    return '';
                }
            }

            formatLJLList(list) {
                let idtList = []

                for (let chain of list) {
                    let idt = this.helmToIDT(chain)
                    idtList.push(idt);
                }
                return idtList;
            }

            getPosition = (index, list) => {
                if (index === 0) {
                    return '5'
                }
                if ((index + 1) === list.length)
                    return '3'
                return 'i'
            }
            parseBase = (unit) => {
                let i = unit.indexOf('(')
                let f = unit.indexOf(')')
                let u = unit.substring(i + 1, f);
                if (u === '5meC' || u === '5mC' || u === 'meC' || u === 'C')
                    return 'C'
                else
                    return u;
            }

            sequence_comp_strand(strand, chain) {

                console.log('debubg');

                let idt = '';
                let index = 0;
                let c = chain.split('.');
                for (let i of c) {
                    let unit = '';
                    let position = this.getPosition(index, c);
                    let mod = null
                    let base = this.parseBase(i);

                    if (i.toLocaleLowerCase().startsWith('cet(')) {
                        mod = 'cEtBNA'
                    }
                    else if (i.toLocaleLowerCase().startsWith('moe(')) {
                        mod = '2MOE'
                    } else if (i.toLowerCase().startsWith('d(')) {
                        if (base.toLowerCase() === 'c') {
                            mod = 'Me-d'
                        }
                    }

                    if (!mod) {
                        if (position === '5') {
                            unit += '/5'
                        }
                    } else {
                        unit += '/' + position + mod;
                    }

                    if (mod != null && mod != 'Me-d')
                        unit += 'r' + base;
                    else
                        unit += base;
                    if (unit.startsWith('/')) {
                        unit += '/'
                    }
                    if (i.endsWith(')sp')) {
                        unit += '*'
                    }
                    idt += unit;
                    index++;

                }

                idt = idt.replace(/\/\//g, '/')

                return idt;
            }

            // IDT WRITES A MODIFICATION ONE OF TWO WAYS, and which one is not a style choice.
            //
            //   inline, in front of the base, the same anywhere in the strand:
            //     LNA (IDT's Affinity Plus)  +A +C +G +T
            //     2'-O-methyl                mA mC mG mU
            //     RNA                        rA rC rG rU
            //     2'-F                       fA fC fG fU
            //   as a bracketed code that differs at the 5' end, internally and at the 3':
            //     2'-MOE                     /52MOErA/  /i2MOErA/  /32MOErA/
            //     5-methyl dC                /iMe-dC/
            //
            // Unmodified DNA is the bare letter and carries no code at all, at any position.
            //
            // The inline set used to fall through to the bracketed branch or to nothing:
            // LNA came out as /5+rA/, and 2'-OMe, RNA and 2'-F came out as plain DNA letters,
            // which is an order for a different compound rather than an order IDT rejects.
            // A 5' DNA base came out as /5A/, which is not a code IDT has.
            INLINE_SUGARS = [
                ['lna', '+'], ['l', '+'], ['+', '+'],
                ['m', 'm'],
                ['r', 'r'],
                ['f', 'f'], ['2f', 'f']
            ];

            // A HELM-ish token, in either of the two spellings this app stores:
            //   moe(5meC)sp      a bare sugar word, the dotted form the editor writes
            //   [moe](5meC)[sp]  bracketed monomer symbols, what a HELM string carries
            // Reading only the first dropped every modification in a bracketed structure --
            // silently, as a plain DNA letter -- which is an order for the wrong compound.
            splitUnit = (token) => {
                const t = ('' + token).trim();
                const op = t.indexOf('(');
                if (op < 0) return null;                      // a linker-only token
                const cp = t.indexOf(')');
                const tail = (cp >= 0) ? t.substring(cp + 1) : '';
                return {
                    sugar: t.substring(0, op).replace(/[\[\]]/g, '').trim().toLowerCase(),
                    raw: (cp > op ? t.substring(op + 1, cp) : '').trim(),
                    ps: /sp/i.test(tail)                      // ...)sp or ...)[sp]
                };
            };
            isLinkerOnly = (token) => /^\[?\s*sp\s*\]?$/i.test(('' + token).trim());

            // A STRUCTURE -> ITS CHAINS: [{ id, tokens }].
            //
            // 'RNA1{…}|RNA2{…}$$$$' is two chains and a duplex is two tubes, so whatever
            // orders from this has to see them apart. A bare token list is one chain. The
            // $-separated connection section at the end of a full HELM string is not a chain
            // and is left behind.
            //
            // A SINGLE wrapped chain has to be unwrapped too: 'RNA1{[moe](A)…}$$$$' split on
            // '.' puts 'RNA1{[moe](A)' in the first token, whose sugar reads as neither moe
            // nor anything else, so the 5' monomer came out as a plain DNA letter.
            chainsOf = (structure) => {
                const st = ('' + (structure || '')).trim();
                if (!st) return [];
                if (st.indexOf('{') >= 0) {
                    const out = [], re = /([A-Za-z0-9]+)\{([^}]*)\}/g;
                    let m;
                    while ((m = re.exec(st))) { const body = m[2].trim(); if (body) out.push({ id: m[1], tokens: body }); }
                    if (out.length) return out;
                }
                return st.split('|').map((c, i) => ({ id: 'RNA' + (i + 1), tokens: c.trim() })).filter((c) => c.tokens);
            };

            // The IDT string for ONE chain of tokens. format() below is the entry point for
            // a whole structure; this is what the per-strand callers want.
            format(structure) {
                const chains = this.chainsOf(structure);
                if (!chains.length) return '';
                if (chains.length === 1) return this.formatChain(chains[0].tokens);
                // More than one strand: the long-standing shape callers expect, each strand
                // named. Anything ordering per tube should use chainsOf + formatChain.
                return chains.map((c) => c.id + ': ' + this.formatChain(c.tokens) + ';').join('');
            }

            formatChain(chain) {

                // First pass: the monomers, and which of them carry a phosphorothioate. A
                // linkage written as its own token belongs to the monomer before it.
                const units = [];
                for (const token of ('' + chain).split('.')) {
                    const u = this.splitUnit(token);
                    if (u) { units.push(u); continue; }
                    if (this.isLinkerOnly(token) && units.length) units[units.length - 1].ps = true;
                }

                // Second pass: one IDT code per monomer, '*' for each PS linkage between two.
                let idt = '';
                for (let index = 0; index < units.length; index++) {
                    const u = units[index];
                    const position = (index === 0) ? '5' : (index === units.length - 1 ? '3' : 'i');
                    const base = this.parseBase('(' + u.raw + ')');
                    let unit = '';

                    let inline = '';
                    for (const pair of this.INLINE_SUGARS) {
                        if (u.sugar === pair[0]) { inline = pair[1]; break; }
                    }

                    if (inline) {
                        unit = inline + base;
                    } else {
                        let mod = null;
                        if (u.sugar === 'cet') {
                            mod = 'cEtBNA'
                        } else if (u.sugar === 'moe') {
                            mod = '2MOE'
                        } else if (u.sugar === 'd' || u.sugar === '') {
                            // /iMe-dC/ is 5-METHYL dC, so it belongs only to a token that
                            // says so. parseBase normalises 5meC, 5mC, meC and C all to 'C',
                            // so asking it turned every DNA cytosine in a gap into the
                            // methylated one: a different compound from the one designed.
                            const raw = u.raw.toLowerCase();
                            if (raw === '5mec' || raw === '5mc' || raw === 'mec') mod = 'Me-d';
                        }

                        if (mod) unit += '/' + position + mod;
                        if (mod != null && mod != 'Me-d') unit += 'r' + base;
                        else unit += base;
                        if (unit.startsWith('/')) unit += '/';
                    }

                    // The PS sits BETWEEN two monomers: a flag on the last one has nothing
                    // after it to link to.
                    if (u.ps && index < units.length - 1) unit += '*';
                    idt += unit;
                }

                return idt;
            }

            formatUsingIONISCODES(chain) {

                console.log('debubg');

                let idt = '';
                let index = 0;
                let c = chain.split('.');
                for (let i of c) {
                    let unit = '';
                    let position = this.getPosition(index, c);
                    let mod = null;
                    let base = this.parseBase(i);
                    let dna = i.toLowerCase().startsWith('d(') ? true : false;

                    if (i.toLocaleLowerCase().startsWith('cet(')) {
                        mod = 'cEtBNA'
                    }
                    else if (i.toLocaleLowerCase().startsWith('moe(')) {
                        mod = 'MOE'
                    } else if (i.toLowerCase().startsWith('d(')) {
                        if (base.toLowerCase() === 'c') {
                            mod = 'Me-d'
                        }
                    }

                    if (!mod) {
                        if (position === '5') {
                            unit += '/5'
                        }
                    } else {
                        unit += '/' + position + mod;
                    }

                    if (mod && !dna)
                        unit += 'r' + base;
                    else
                        unit += base;
                    if (unit.startsWith('/')) {
                        unit += '/'
                    }
                    if (i.endsWith(')sp')) {
                        unit += '*'
                    }
                    idt += unit;
                    index++;

                }

                return idt;
            }

        }

        resolve(new IDT())
    });

}
