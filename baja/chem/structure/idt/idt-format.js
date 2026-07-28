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

            format(chain) {

                console.log('debubg');

                if (chain.indexOf('|') > 0) {
                    let chains = helm.convertHELMtoIDT(chain)

                    let st = '';
                    for ( let c of chains ) {
                        st += c["chainID"] + ': ' + c["idt"] + ';'
                    }

                    return st;
                }

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
                    else if (i.toLocaleLowerCase().startsWith('lna(')) {
                        mod = '+'
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
