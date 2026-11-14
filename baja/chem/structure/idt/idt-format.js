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

            // THE SUGAR TABLE. One place, and nothing outside it is guessed.
            //
            // Each entry gives the IDT code body for a residue; the position prefix (5, i, 3)
            // and the slashes are added around it. `ribo: true` means the code carries the
            // r-prefixed base, the way 2'-MOE codes are written (/i2MOErA/).
            //
            //   bare: true   the residue is written as a plain letter with no slashes at all,
            //                which is how DNA (A C G T) and LNA (+A) are written. A plain base
            //                wrapped as /5A/ is not an IDT code and was being emitted for the
            //                first residue of every DNA oligo.
            //
            // WHAT IS NOT IN THIS TABLE IS REFUSED, NOT GUESSED. The previous version fell
            // through to the bare base for any sugar it did not recognise, so a 2'-OMe A and
            // a 2'-F G both exported as plain "A" and "G": an siRNA came out as an
            // unmodified oligo, in a file that looked complete and would have been ordered.
            // Silence is the one thing this cannot do.
            idtSugars = {
                d: { bare: true },                              // DNA: A C G T
                r: { body: 'r', bare: true, riboLetter: true }, // RNA: rA rC rG rU
                m: { body: '2OMe' },                            // 2'-O-methyl: /i2OMeA/
                fl2r: { body: '2F' },                           // 2'-fluoro:   /i2FA/
                moe: { body: '2MOE', ribo: true },              // 2'-MOE:      /i2MOErA/
                lna: { body: '+', bare: true, prefixLetter: true }, // LNA:     +A
                cet: { body: 'cEtBNA', ribo: true }             // cEt, by the house convention
            };

            // The sugar a HELM-ish residue is written with: moe(A), d(C), [fl2r](G), m(U).
            idtSugarOf(unit) {
                const u = ('' + unit).trim();
                const m = u.match(/^\[?([A-Za-z0-9']+)\]?\s*\(/);
                return m ? m[1].toLowerCase() : null;
            }

            // THE HELM ENVELOPE COMES OFF FIRST.
            //
            // A compound's structure is a full HELM string -- RNA1{moe(A)sp.moe(G)sp...}$$$$,
            // or several chains joined by | for a duplex -- and not the bare dotted template.
            // Splitting the whole string on '.' makes the first token "RNA1{moe(A)sp", which
            // matches no residue pattern at all. That is why the first base of every oligo
            // came out as /5A/: it was never a 5-prime convention, it was the wrapper eating
            // the first residue, and every other residue in a single-chain oligo was fine
            // only because the wrapper is at the front.
            //
            // Returns [{id, body}]. A bare template with no envelope is one unnamed chain, so
            // a template and a HELM string both work through the same path.
            helmChains(text) {
                const out = [];
                const re = /([A-Za-z0-9_]+)\s*\{([^}]*)\}/g;
                let m;
                while ((m = re.exec(text)) !== null) {
                    if (('' + m[2]).trim()) out.push({ id: m[1], body: m[2] });
                }
                if (!out.length) out.push({ id: '', body: ('' + text).split('$')[0] });
                return out;
            }

            // Returns { idt, problems: [...] }. problems is empty when every residue mapped.
            formatStrict(chain) {
                const text = '' + (chain || '');
                if (!text.trim()) return { idt: '', problems: ['the compound has no chemistry'] };
                const chains = this.helmChains(text);
                if (chains.length > 1) {
                    // A duplex or a conjugate: each strand is ordered separately, so each gets
                    // its own codes, labelled. A failure in one strand is still reported.
                    const parts = [], probs = [];
                    for (const c of chains) {
                        const r = this.formatChain(c.body);
                        for (const pr of r.problems) if (probs.indexOf(c.id + ': ' + pr) < 0) probs.push(c.id + ': ' + pr);
                        if (r.idt) parts.push(c.id + ': ' + r.idt);
                    }
                    return { idt: probs.length ? '' : parts.join('; '), problems: probs };
                }
                return this.formatChain(chains[0].body);
            }

            formatChain(body) {
                const units = ('' + body).split('.').map((x) => x.trim()).filter((x) => x.length);
                const out = [];
                const problems = [];
                const seen = new Set();
                for (let k = 0; k < units.length; k++) {
                    const u = units[k];
                    // A bare linkage token between residues; the linkage is read off the
                    // residue it is attached to, below.
                    if (u === 'sp' || u === 'p') continue;
                    const sugar = this.idtSugarOf(u);
                    const base = this.parseBase(u);
                    if (!sugar || !base) {
                        if (!seen.has(u)) { problems.push('cannot read the residue "' + u + '"'); seen.add(u); }
                        continue;
                    }
                    const spec = this.idtSugars[sugar];
                    if (!spec) {
                        const key = sugar;
                        if (!seen.has(key)) {
                            problems.push('no IDT code is defined for the sugar "' + sugar + '"');
                            seen.add(key);
                        }
                        continue;
                    }
                    const position = this.getPosition(k, units);
                    let unit;
                    if (spec.bare) {
                        // DNA, RNA and LNA are written as letters, never wrapped in slashes.
                        // 5-methyl dC is the exception: it IS a modification and carries a
                        // code, with its position prefix like any other.
                        if (sugar === 'd' && /^(5meC|5mC|meC)$/i.test(this.rawBase(u))) {
                            unit = '/' + position + '5Me-dC/';
                        } else if (spec.prefixLetter) {
                            unit = spec.body + base;             // +A
                        } else if (spec.riboLetter) {
                            unit = spec.body + base;             // rA
                        } else {
                            unit = base;                          // A
                        }
                    } else {
                        unit = '/' + position + spec.body + (spec.ribo ? 'r' : '') + base + '/';
                    }
                    // The linkage FOLLOWING this residue. Written on the residue in these
                    // templates, so the last residue's linkage is a linkage to nothing: a
                    // trailing * is not valid and is dropped.
                    if (/\)sp$/.test(u) && k < units.length - 1) unit += '*';
                    out.push(unit);
                }
                return { idt: out.join(''), problems: problems };
            }

            // The raw base text as written, before parseBase folds 5meC and friends to C.
            rawBase = (unit) => {
                const i = ('' + unit).indexOf('(');
                const f = ('' + unit).indexOf(')');
                return (i >= 0 && f > i) ? ('' + unit).substring(i + 1, f) : '';
            };

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
