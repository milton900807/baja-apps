function () {

    return new Promise(async (resolve, reject) => {

        let Amplicon = await exec('flexigraph/amplicon.js')
        let Oligo = await exec('flexigraph/oligo.js')
        let SIRNA = await exec('flexigraph/sirna.js')

        // ---- Monomer library (baja/chem/monomers.js) --------------------------
        // Every monomer symbol an oligo's HELM structure emits (sugar, base,
        // linker) must be a real symbol from this library. Unknown symbols are
        // remapped to the nearest library equivalent so generated structures are
        // always valid HELM built from monomers that actually exist. Loaded once
        // at module init; if it fails to load, normalization is a no-op (the
        // structure is left exactly as generated).
        let __MONOMER_SYMBOLS = new Set();
        let __MONOMER_SYMBOLS_LC = new Map();     // lowercased symbol -> canonical
        try {
            let __mon = await exec('baja/chem/monomers.js');
            // The library resolves either a raw array, a Monomers instance
            // (.monomers), or the default nested shape (.monomers.monomers).
            const __dig = (v) => Array.isArray(v) ? v
                : (v && Array.isArray(v.monomers)) ? v.monomers
                    : (v && v.monomers && Array.isArray(v.monomers.monomers)) ? v.monomers.monomers
                        : [];
            let __arr = __dig(__mon);
            for (let m of __arr) {
                if (m && m.symbol) {
                    __MONOMER_SYMBOLS.add(m.symbol);
                    __MONOMER_SYMBOLS_LC.set(('' + m.symbol).toLowerCase(), m.symbol);
                }
            }
        } catch (e) {
            try { console.warn('biopolymer: could not load monomer library for HELM validation', e); } catch (_e) { }
        }

        class Biopolymer {
            // Curated synonyms → canonical library symbol, keyed BY ROLE. Role
            // matters because the library also holds amino-acid monomers whose
            // single-letter codes collide with oligo shorthands (F=Phe vs 2'-F,
            // S=Ser vs phosphorothioate, M=Met vs 2'-OMe, R=Arg vs ribose, …), so
            // a bare case-insensitive match would corrupt oligo symbols.
            static __MONOMER_ALIASES = {
                sugar: {
                    // 2'-fluoro (position variants collapse to the library 2'-F sugar)
                    'f': 'fl2r', 'fl2l': 'fl2r', 'fl2i': 'fl2r', '2f': 'fl2r', "2'f": 'fl2r', 'ff': 'fl2r',
                    // 2'-O-methyl
                    'o': 'm', 'ome': 'm', '2ome': 'm', "2'ome": 'm', 'omethyl': 'm', '2-ome': 'm',
                    // 2'-MOE
                    'e': 'moe', '2moe': 'moe', "2'moe": 'moe', 'moe3r': 'moe', '2-moe': 'moe',
                    // LNA / cEt
                    'l': 'lna', '+': 'lna', 'locked': 'lna',
                    'scet': 'cet', 'rcet': 'cet', 'cet': 'cet',
                    // ribo / deoxy sugars
                    'rna': 'r', 'ribo': 'r', 'dna': 'd', 'deoxy': 'd',
                },
                linker: {
                    // phosphorothioate
                    's': 'sp', 'ps': 'sp', 'pto': 'sp', 'phosphorothioate': 'sp', 'sp': 'sp',
                    // phosphodiester
                    'o': 'p', 'po': 'p', 'phosphate': 'p', 'p': 'p',
                },
                base: { 'a': 'A', 'c': 'C', 'g': 'G', 't': 'T', 'u': 'U' },
            };

            static monomerSymbols() { return __MONOMER_SYMBOLS; }
            static isValidMonomer(sym) { return __MONOMER_SYMBOLS.has(sym); }

            // Map one monomer symbol to a valid library symbol without corrupting a
            // symbol that is already valid. Order: exact (case-sensitive) → role-aware
            // alias → case-insensitive but ONLY for multi-char symbols (single letters
            // collide with amino-acid codes) → base uppercase → leave unchanged.
            static mapMonomerSymbol(sym, role) {
                if (sym == null) return sym;
                let s = ('' + sym).trim();
                if (s === '') return s;
                if (__MONOMER_SYMBOLS.size === 0) return s;      // library not loaded
                if (__MONOMER_SYMBOLS.has(s)) return s;
                let roleMap = Biopolymer.__MONOMER_ALIASES[role] || {};
                let a = roleMap[s] || roleMap[s.toLowerCase()];
                if (a && __MONOMER_SYMBOLS.has(a)) return a;
                if (s.length > 1) { let lc = __MONOMER_SYMBOLS_LC.get(s.toLowerCase()); if (lc) return lc; }
                if (role === 'base') { let u = s.toUpperCase(); if (__MONOMER_SYMBOLS.has(u)) return u; }
                return s;
            }

            static __debracket(sym) { return ('' + sym).replace(/^\[|\]$/g, ''); }
            // HELM brackets multi-character monomer symbols; single-char stay bare.
            static __bracket(sym) {
                let s = Biopolymer.__debracket(sym);
                return (s.length > 1) ? ('[' + s + ']') : s;
            }

            // Normalize one '.'-separated token of the internal structure notation
            // (e.g. "m(?)", "[fl2r](A)", "d(A)p", "[sp]", "p") so every symbol it
            // references is a valid library monomer.
            static __normalizeToken(tok) {
                let s = ('' + tok).trim();
                if (s === '') return s;
                let ip = s.indexOf('('), ep = s.indexOf(')');
                if (ip >= 0 && ep > ip) {
                    let sugar = Biopolymer.__debracket(s.substring(0, ip).trim());
                    let base = Biopolymer.__debracket(s.substring(ip + 1, ep).trim());
                    let suffix = s.substring(ep + 1).trim();     // trailing linker, or ''
                    let ms = Biopolymer.mapMonomerSymbol(sugar, 'sugar');
                    let out = Biopolymer.__bracket(ms) + '(';
                    if (base === '?' || base === '') {           // unfilled placeholder
                        out += base + ')';
                    } else {
                        let mb = Biopolymer.mapMonomerSymbol(base, 'base');
                        out += Biopolymer.__bracket(mb) + ')';
                    }
                    if (suffix) out += Biopolymer.__bracket(Biopolymer.mapMonomerSymbol(Biopolymer.__debracket(suffix), 'linker'));
                    return out;
                }
                // standalone linker / symbol (no base in parens)
                return Biopolymer.__bracket(Biopolymer.mapMonomerSymbol(Biopolymer.__debracket(s), 'linker'));
            }

            // Ensure every monomer symbol in a structure string is a valid library
            // symbol. Preserves any "PREFIX{ ... }SUFFIX" HELM wrapper and handles
            // multiple '|'-separated chains (siRNA duplex). No-op when the library
            // is unavailable or the input isn't a string.
            static normalizeStructure(struc) {
                if (struc == null || typeof struc !== 'string') return struc;
                if (__MONOMER_SYMBOLS.size === 0) return struc;
                let prefix = '', suffix = '', body = struc;
                let ob = struc.indexOf('{'), cb = struc.lastIndexOf('}');
                if (ob >= 0 && cb > ob) {
                    prefix = struc.substring(0, ob + 1);
                    suffix = struc.substring(cb);
                    body = struc.substring(ob + 1, cb);
                }
                let chains = body.split('|').map((chain) =>
                    chain.split('.').map((t) => Biopolymer.__normalizeToken(t)).join('.'));
                return prefix + chains.join('|') + suffix;
            }

            // Wrap a single-strand token list as a complete HELM string
            // (RNA1{...}$$$$). No-op if it is already wrapped or empty.
            static wrapHelm(struc) {
                let s = ('' + (struc || '')).trim();
                if (!s || s.indexOf('{') >= 0) return s;
                return 'RNA1{' + Biopolymer.normalizeStructure(s) + '}$$$$';
            }

            chains = [];
            type = ''
            chain_sequences = [];

            constructor(chain, type, chain_sequences) {
                this.chains.push(chain);
                this.type = type;
                this.chain_sequences = chain_sequences;
            }

            static createOligoStr(chem_template, sequence) {
                let template = '';
                if (chem_template.indexOf('{') < 0) {
                    return chem_template;
                }

                let split = chem_template.split(/\{([0-9]*)\}/g)
                for (let s = 0; s < split.length; s += 2) {
                    let co = split[s]
                    let count = +split[s + 1]
                    co = co.trim();
                    if (co.startsWith('(')) {
                        let temp = co.substring(1, co.length - 1)

                        for (let i = 0; i < count; i++) {
                            template += temp;
                        }
                    }
                }
                for (let c of sequence) {
                    template = template.replace('?', c)
                }

                console.log(' template ' + template);

                return template;
            }

            static applySequenceToTemplate(chem_template, sequence) {
                let construct = '';
                let sp = chem_template.split('.')
                let index = 0;
                for (let s of sp) {
                    if (s.indexOf('()') >= 0) {
                        if (sequence[index]) {
                            s = s.replace('()', '(' + sequence[index++] + ')')
                        }
                    }
                    else if (s.indexOf('(?)') >= 0) {
                        if (sequence[index]) {
                            s = s.replace('(?)', '(' + sequence[index++] + ')')
                        }
                    }
                    construct += s + '.';

                }
                if (construct.endsWith('.'))
                    construct = construct.substring(0, construct.length - 1)
                return construct;
            }

            static applyAntisenseSequenceToTemplate_dep(chem_template, sequence) {
                let construct = '';
                let sp = chem_template.split('.')
                let index = sequence.length - 1;
                for (let i = sp.length - 1; i >= 0; i--) {
                    let s = sp[i];
                    if (s.indexOf('()') >= 0) {
                        if (sequence[index]) {
                            s = s.replace('()', '(' + sequence[index--] + ')')
                        }
                    }
                    else if (s.indexOf('(?)') >= 0) {
                        if (sequence[index]) {
                            s = s.replace('(?)', '(' + sequence[index--] + ')')
                        }
                    }
                    construct = s + '.' + construct;
                }
                if (construct.startsWith('.'))
                    construct = construct.substring(1)
                return construct;
            }

            static applyAntisenseSequenceToTemplate(chem_template, sequence) {
                let construct = '';
                let sp = chem_template.split('.')
                let index = 0;
                for (let s of sp) {
                    if (s.indexOf('()') >= 0) {
                        if (sequence[index]) {
                            s = s.replace('()', '(' + sequence[index++] + ')')
                        }
                    }
                    else if (s.indexOf('(?)') >= 0) {
                        if (sequence[index]) {
                            s = s.replace('(?)', '(' + sequence[index++] + ')')
                        }
                    }
                    construct += s + '.';

                }
                if (construct.endsWith('.'))
                    construct = construct.substring(0, construct.length - 1)
                return construct;
            }

            static createFromOS(chem_template, sequence, compound_type, tstart, y) {
                let base_count = Biopolymer.countBasesOligoScript(chem_template);

                let template = '';
                let split = chem_template.split(/\{([0-9]*)\}/g)
                for (let s = 0; s < split.length; s += 2) {
                    let co = split[s]
                    let count = +split[s + 1]
                    co = co.trim();
                    if (co.startsWith('(')) {
                        let temp = co.substring(1, co.length - 1)

                        for (let i = 0; i < count; i++) {
                            template += temp;
                        }
                    }
                    for (let c of sequence) {
                        template = template.replace('?', c)
                    }

                    let anno = new Oligo('primer-probe', 'primer-probe', template, tstart, (tstart + base_count), y);

                    anno.sequence = sequence;
                    return anno;
                }
            }

            static designPrimers(sequence, targetStart, targetEnd, primerLength, strandDirection) {
                if (strandDirection !== 'forward' && strandDirection !== 'reverse') {
                    throw new Error("Strand direction must be 'forward' or 'reverse'.");
                }
                if (strandDirection === 'forward') {
                    if (targetStart < primerLength || targetEnd > sequence.length - primerLength) {
                        throw new Error("Target region is too close to the sequence boundaries for the chosen primer length.");
                    }
                    const leftPrimer = sequence.slice(targetStart - primerLength, targetStart);
                    const rightPrimer = reverseComplement(sequence.slice(targetEnd, targetEnd + primerLength));
                    return {
                        leftPrimer,
                        rightPrimer
                    };
                } else {
                    if (targetStart < primerLength || targetEnd > sequence.length - primerLength) {
                        throw new Error("Target region is too close to the sequence boundaries for the chosen primer length.");
                    }
                    const reversedSequence = reverseComplement(sequence);
                    const reversedTargetStart = sequence.length - targetEnd;
                    const reversedTargetEnd = sequence.length - targetStart;
                    const leftPrimer = reversedSequence.slice(reversedTargetStart - primerLength, reversedTargetStart);
                    const rightPrimer = reverseComplement(reversedSequence.slice(reversedTargetEnd, reversedTargetEnd + primerLength));
                    return {
                        leftPrimer,
                        rightPrimer
                    };
                }
            }

            static createPrimerProbe(p, track) {
                let mo = null;
                console.log('debubg');
                if (p['mid']) {

                    let m = p['mid'];
                    let msequence = m.sequence;
                    let mx = m.x;
                    let mix = mx.split(',')[0];
                    mix = +mix;
                    let mchemistry_template = `([?]d.p.){${msequence.length - 1}}([?]d){1}`
                    mo = Biopolymer.createFromOS(mchemistry_template, msequence, 'primer', track.xi + mix, 0.15);
                    mo['tm'] = m['tm']
                    mo['gc'] = m['gc']
                    mo['hairpin_th'] = m['hairpin_th']
                    mo['end_stability'] = m['end_stability']

                }

                let left = p['left'];

                let lsequence = left.sequence;
                let lx = left.x;
                let lix = lx[0];
                lix = +lix;

                let lchemistry_template = `([?]d.p.){${lsequence.length - 1}}([?]d){1}`
                let lo = Biopolymer.createFromOS(lchemistry_template, lsequence, 'primer', track.xi + lix, 0.15);
                lo['tm'] = left['tm']
                lo['gc'] = left['gc']
                lo['hairpin_th'] = left['hairpin_th']
                lo['end_stability'] = left['end_stability']

                lo.strand = track.strand
                let right = p['right'];

                let rsequence = right.sequence;
                rsequence = Biopolymer.reverseComp(rsequence);
                let rx = right.x;

                let rix = rx[0];
                rix = +rix;
                let rchemistry_template = `([?]d.p.){${rsequence.length - 1}}([?]d){1}`
                let ro = Biopolymer.createFromOS(rchemistry_template, rsequence, 'primer', track.xi + rix - rsequence.length + 1, 0.15)
                ro.strand = track.strand;
                lo.strand = track.strand;

                ro['tm'] = right['tm']
                ro['gc'] = right['gc']
                ro['hairpin_th'] = right['hairpin_th']
                ro['end_stability'] = right['end_stability']

                if (track.strand < 0) {
                    lo.synthesisSequence = ro.sequence
                    ro.synthesisSequence = ro.sequence
                } else {
                    lo.synthesisSequence = lo.sequence
                    ro.synthesisSequence = Biopolymer.reverseComp(ro.sequence)
                }

                let amplicon = null;
                if (!p['mid']) {
                    amplicon = new Amplicon(lo, ro);
                    return amplicon;
                } else {

                    amplicon = new Amplicon(lo, ro, mo);
                    return amplicon;
                }
            }

            static createProbe(xi, xf, track) {
                let msequence = track.getSequenceRange(xi, xf);
                let mchemistry_template = `([?]d.p.){${msequence.length - 1}}([?]d){1}`

                let lo = Biopolymer.createFromOS(mchemistry_template, msequence, 'probe', track.xi + xi, 0.15);
                lo.strand = track.strand
                if (track.strand < 0) {
                    lo.synthesisSequence = Biopolymer.reverse(lo.sequence)
                } else {
                    lo.synthesisSequence = Biopolymer.reverseComp(lo.sequence)
                }
                return lo;
            }

            static createCompoundFromOligoScript(chem_template, track, tstart, y, compound_type) {

                if (!y) {
                    y = track.y;
                }
                tstart = Math.floor(tstart);
                let sequence_index = tstart - track.xi;

                let base_count = Biopolymer.countBasesOligoScript(chem_template);
                let sequence = track.getSequence();
                let subseq = sequence.substring(sequence_index, (sequence_index + base_count));
                let oligo = Biopolymer.create(compound_type, chem_template, subseq, tstart, base_count, y);
                track.addOligo(oligo);
            }

            static getSequence(chain) {
                let t = chain;
                let i = t.indexOf('(')
                let f = t.indexOf(')')
                let seq = '';
                while (i > 0) {
                    seq += t.substring(i + 1, f);
                    t = t.substring(f + 1);
                    i = t.indexOf('(')
                    f = t.indexOf(')')
                }
                return seq;
            }

            // Named siRNA modification patterns. Returns {sense, antisense} oligoscript
            // templates (m(?) = 2'-OMe, [fl2r](?) = 2'-F; [sp] = PS, p = PO) chosen by
            // the chemistry NAME, so a named siRNA without explicit strands still builds
            // the specific modification pattern for that chemistry.
            static siRNATemplatesFor(name, n) {
                n = n || 21;
                const nm = ('' + (name || '')).toLowerCase();
                const tok = (x) => x === 'f' ? '[fl2r](?)' : 'm(?)';
                const strand = (mods) => {
                    let s = '';
                    for (let i = 0; i < mods.length; i++) {
                        s += tok(mods[i]);
                        if (i < mods.length - 1) {
                            const ps = (i < 2) || (i >= mods.length - 3);   // terminal phosphorothioates
                            s += (ps ? '[sp].' : 'p.');
                        }
                    }
                    return s;
                };
                const rep = (pat) => Array.from({ length: n }, (_, i) => pat[i % pat.length]);
                const all = (m) => Array.from({ length: n }, () => m);
                let senseMods, antiMods;
                if (nm.indexOf('full') >= 0 || nm.indexOf('2ome') >= 0 || nm.indexOf('2-ome') >= 0 || nm.indexOf('o-methyl') >= 0) {
                    // Fully 2'-OMe
                    senseMods = all('m'); antiMods = all('m');
                } else if (nm.indexOf('esc') >= 0) {
                    // Enhanced Stabilization Chemistry (ESC / ESC+): 2'-OMe-rich with a
                    // few 2'-F at central/seed positions.
                    senseMods = all('m').map((x, i) => ([6, 8, 9, 10].indexOf(i) >= 0) ? 'f' : 'm');
                    antiMods = all('m').map((x, i) => ([1, 5, 13, 15].indexOf(i) >= 0) ? 'f' : 'm');
                } else {
                    // STC / default: alternating 2'-OMe / 2'-F.
                    senseMods = rep(['f', 'm']); antiMods = rep(['m', 'f']);
                }
                return { sense: strand(senseMods), antisense: strand(antiMods) };
            }

            static async generateCompound(chemObj, bioObj) {

                console.log('debubg');
                // Normalize the molecule type across the field-name variants used by
                // different chemistry sources (type / molType / moltype). A chemistry
                // that carries a sense strand is a two-stranded siRNA regardless of
                // how (or whether) its type is labelled.
                let type = chemObj.type || chemObj.molType || chemObj.moltype;
                if ((!type || ('' + type).toLowerCase() === 'sirna') && chemObj.sense && (chemObj.antisense || chemObj.template)) {
                    type = 'siRNA';
                }
                if (chemObj.buildFunction != null) {
                    let bf = await exec(chemObj.buildFunction, chemObj, bioObj);
                    if (bf) return bf;   // fall through to the template build if it produced nothing
                }

                if (type === 'gapmer') {
                    let currentSequence = bioObj.targetSequence;
                    let targetSequence = bioObj.targetSequence;;
                    let templateStr = chemObj.template;
                    let currentStartX = bioObj.startIndex;
                    let base_count = Biopolymer.countBases(templateStr);
                    let y = bioObj.y;

                    let strand;

                    if (bioObj.strand != null) {
                        strand = bioObj.strand;
                    }
                    let synthesisSeq = targetSequence;
                    if (strand < 0) {
                        synthesisSeq = targetSequence   // reverse strand: ASO = genomic+ target (antisense to mRNA)
                    } else {
                        synthesisSeq = Biopolymer.reverseComp(targetSequence)
                    }

                    let templateStructure = Biopolymer.applySequenceToTemplate(templateStr, synthesisSeq);
                    // Store as a complete HELM string (RNA1{...}$$$$), not a bare token list.
                    templateStructure = 'RNA1{' + Biopolymer.normalizeStructure(templateStructure) + '}$$$$';
                    let anno = new Oligo(type, currentSequence, templateStructure, currentStartX, (currentStartX + base_count), y);
                    anno.synthesisSequence = synthesisSeq
                    anno.strand = strand;
                    return anno;
                } else if (type && type.toUpperCase() === 'DNA') {

                    let currentSequence = bioObj.targetSequence;
                    let targetSequence = bioObj.targetSequence;;

                    let currentStartX = bioObj.startIndex;

                    let y = bioObj.y;
                    let strand;
                    if (bioObj.strand != null) {
                        strand = bioObj.strand;
                    }
                    let synthesisSeq = targetSequence;
                    if (strand < 0) {
                        synthesisSeq = targetSequence   // reverse strand: ASO = genomic+ target (antisense to mRNA)
                    } else {
                        synthesisSeq = Biopolymer.reverseComp(targetSequence)
                    }
                    let base_count = synthesisSeq.length;
                    let length = synthesisSeq.length;
                    let templateStr = ''
                    for (let t = 0; t < length - 1; t++) {
                        templateStr += 'd(?).p.'
                    }
                    templateStr += 'd(?)'
                    let templateStructure = Biopolymer.applySequenceToTemplate(templateStr, synthesisSeq);

                    templateStructure = 'RNA1{' + templateStructure + '}$$$$'
                    templateStructure = Biopolymer.normalizeStructure(templateStructure);

                    console.log('debubg');
                    let anno = new Oligo(type, currentSequence, templateStructure, currentStartX, (currentStartX + base_count), y);
                    anno.strand = strand;
                    anno.synthesisSequence = synthesisSeq

                    return anno;
                }
                else if (type === 'aso') {
                    let currentSequence = bioObj.targetSequence;
                    let targetSequence = bioObj.targetSequence;

                    console.log(' current sequence ' + currentSequence);
                    let templateStr = chemObj.template;
                    let currentStartX = bioObj.startIndex;
                    let base_count = Biopolymer.countBases(templateStr);

                    let strand;

                    if (bioObj.strand != null) {
                        strand = bioObj.strand;
                    }
                    let synthesisSeq = targetSequence;
                    if (strand < 0) {
                        synthesisSeq = targetSequence   // reverse strand: ASO = genomic+ target (antisense to mRNA)
                    } else {
                        synthesisSeq = Biopolymer.reverseComp(targetSequence)
                    }

                    let templateStructure = Biopolymer.applySequenceToTemplate(templateStr, synthesisSeq);
                    // Store as a complete HELM string (RNA1{...}$$$$), not a bare token list.
                    templateStructure = 'RNA1{' + Biopolymer.normalizeStructure(templateStructure) + '}$$$$';

                    let y = bioObj.y;
                    let anno = new Oligo(type, currentSequence, templateStructure, currentStartX, (currentStartX + base_count), y);
                    anno.synthesisSequence = synthesisSeq

                    anno.strand = bioObj.strand;
                    return anno;
                } else if (type === 'siRNA') {

                    // Build the duplex from the chemistry's sense/antisense templates
                    // (mirrors createOligoFromTemplate). If the chemistry has no explicit
                    // strands, choose the modification pattern by its NAME (STC / ESC /
                    // ESC+ / fully-2'-OMe …) so each named siRNA builds its own pattern.
                    let currentStartX = bioObj.startIndex;
                    let y = bioObj.y;
                    let strand = (bioObj.strand != null) ? bioObj.strand : 1;
                    let subseq = bioObj.targetSequence;                 // sense/target strand
                    let synthesisSeq = (strand < 0)
                        ? subseq                                        // reverse strand: guide = genomic+ target
                        : Biopolymer.reverseComp(subseq);               // guide/antisense strand

                    let antisense = chemObj.antisense || chemObj.template;
                    let sense = chemObj.sense;
                    if (!antisense || !sense) {
                        const pats = Biopolymer.siRNATemplatesFor(chemObj.name, synthesisSeq.length);
                        if (!antisense) antisense = pats.antisense;
                        if (!sense) sense = pats.sense;
                    }
                    if (!antisense) return null;
                    // Fill the template placeholders — support both "()" and "(?)".
                    const fillTmpl = (tmpl, seq) => {
                        if (('' + tmpl).indexOf('(?)') >= 0) return Biopolymer.applySequenceToTemplate(tmpl, seq);
                        let out = '' + tmpl;
                        for (let c of seq) out = out.replace('()', `(${c})`);
                        return out;
                    };
                    // Guide (antisense) strand = synthesisSeq. The passenger (sense) strand is
                    // the reverse-complement of the guide — its antiparallel duplex partner —
                    // NOT the raw target (which is only reverseComp(guide) on the forward strand).
                    const passengerSeq = Biopolymer.reverseComp(synthesisSeq);
                    antisense = Biopolymer.normalizeStructure(fillTmpl(antisense, synthesisSeq));
                    if (sense) sense = Biopolymer.normalizeStructure(fillTmpl(sense, passengerSeq));

                    let base_count = Biopolymer.countBases(chemObj) || synthesisSeq.length;
                    // SIRNA(type, sequence, sense, antisense, xi, xf, y, strand, structure).
                    // NOTE: y is the 7th arg — passing the start index here would blow up
                    // the track's ymax and collapse every oligo onto the baseline.
                    let oligo = new SIRNA(type, synthesisSeq, sense, antisense,
                        currentStartX, (currentStartX + base_count), y, strand);
                    oligo.strand = strand;
                    oligo.synthesisSequence = synthesisSeq;
                    // Attach a 3' overhang if the chemistry specifies one (e.g. dTdT),
                    // so the draw code renders it hanging off the guide. `overhang: true`
                    // defaults to dTdT; a string sets the overhang bases explicitly.
                    const ohSpec = chemObj.antisenseOverhang || chemObj.overhang;
                    if (ohSpec) {
                        const oh = (ohSpec === true) ? 'TT' : ('' + ohSpec).toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
                        if (oh) {
                            oligo.antisenseOverhang = oh;
                            oligo.senseOverhang = chemObj.senseOverhang
                                ? ('' + chemObj.senseOverhang).toUpperCase().replace(/[^ACGTU]/g, '')
                                : oh;
                        }
                    }
                    return oligo;
                }
                return null;
            }
            static generateDNAOligo(name, synthesisSeq, bioObj) {
                let currentStartX = bioObj.startIndex;
                let y = bioObj.y;
                let strand = bioObj.strand != null ? bioObj.strand : 1;

                const seq = String(synthesisSeq || "").trim().toUpperCase();
                if (!seq) {
                    throw new Error("synthesisSeq is empty");
                }

                if (!/^[ACGTU]+$/.test(seq)) {
                    throw new Error(`Invalid DNA sequence: ${synthesisSeq}`);
                }

                const base_count = seq.length;
                const length = seq.length;

                // Build HELM directly using DNA monomers with inline phosphate linkers.
                // Example: d(A)p.d(T)p.d(C)
                const helmTokens = [];
                for (let i = 0; i < length; i++) {
                    let token = `d(${seq[i]})`;
                    if (i < length - 1) {
                        token += "p";
                    }
                    helmTokens.push(token);
                }

                const templateStructure = Biopolymer.normalizeStructure(`RNA1{${helmTokens.join(".")}}$$$$V2.0`);

                let anno = new Oligo(
                    "DNA",
                    name,
                    templateStructure,
                    currentStartX,
                    currentStartX + base_count,
                    y
                );

                anno.synthesisSequence = seq;

                if (strand <= 0) {
                    anno.sequence = Biopolymer.reverseComp(seq);
                } else {
                    anno.sequence = Biopolymer.comp(seq);
                }

                anno.strand = strand;
                return anno;
            }

            static generateSynthesisSequence(o) {
                if (o.strand < 0) {
                    o.synthesisSequence = o.sequence
                } else {
                    o.synthesisSequence = Biopolymer.reverseComp(o.sequence)
                }
                return o.synthesisSequence

            }

            static generateStructure(chemObj, oligo, track) {
                let type = chemObj.type;
                if (type === 'aso') {
                    let targetSequence = oligo.sequence;
                    let synthesisSeq = ''
                    if (track.strand < 0) {
                        synthesisSeq = targetSequence   // reverse strand: ASO = genomic+ target (antisense to mRNA)
                    } else {
                        synthesisSeq = Biopolymer.reverseComp(targetSequence)
                    }

                    let templateStr = chemObj.template;

                    let structure = Biopolymer.applySequenceToTemplate(templateStr, synthesisSeq);
                    return Biopolymer.normalizeStructure(structure);
                }
                if (type === 'gapmer') {
                    let targetSequence = oligo.sequence;
                    let synthesisSeq = ''
                    if (track.strand < 0) {
                        synthesisSeq = targetSequence   // reverse strand: ASO = genomic+ target (antisense to mRNA)
                    } else {
                        synthesisSeq = Biopolymer.reverseComp(targetSequence)
                    }

                    let templateStr = chemObj.template;

                    let structure = Biopolymer.applySequenceToTemplate(templateStr, synthesisSeq);
                    return Biopolymer.normalizeStructure(structure);
                }

                return null;

            }

            static async refactorTargetSequence(chemObj, targetSequence, strand) {
                let type = chemObj.type;
                chemObj.sequence = targetSequence;
                if (type === 'gapmer') {
                    if (strand < 0) {
                        chemObj.synthesisSeq = targetSequence
                    } else {
                        chemObj.synthesisSeq = Biopolymer.reverseComp(targetSequence)
                    }
                    let structure = chemObj.structure;
                    return chemObj;
                }
                else if (type === 'aso') {
                } else if (type === 'siRNA') {
                    let synthesisSeq = targetSequence;
                    if (strand < 0) {
                        synthesisSeq = targetSequence   // reverse strand: ASO = genomic+ target (antisense to mRNA)
                    } else {
                        synthesisSeq = Biopolymer.reverseComp(targetSequence)
                    }

                    let endchainindex = chemObj.structure.indexOf('$')
                    let chainsOnly = chemObj.structure.substring(0, endchainindex)
                    let chain = chainsOnly.split('|');
                    chain[0] = chain[0].substring(chain[0].indexOf('{') + 1, chain[0].indexOf('}'))
                    let nucleotides = chain[0].split(/\./g)

                    let index = 0;
                    let cn = ``
                    for (let n of nucleotides) {

                        n = n.replace(/\(.\)/, '(' + synthesisSeq[index] + ')')
                        index++;

                        cn += n + '.'
                    }
                    cn = cn.substring(0, cn.length - 1)
                    chainsOnly = 'RNA1{' + cn + '}|' + chain[1]
                    chemObj.structure = chainsOnly + chemObj.structure.substring(endchainindex);

                    showModal({
                        wid: 'json',
                        data: JSON.stringify(chemObj.structure)
                    })

                    return oligo;
                }
                return null;
            }

            static countBases(chemObj) {

                let type = chemObj.type;
                if (type != null) {
                    let length = chemObj['length']
                    if (length) {
                        return length;
                    }
                }

                let templatestring = chemObj['template']
                if (templatestring == undefined) {
                    templatestring = chemObj['guide']
                }
                if (templatestring === undefined && chemObj.structure !== undefined && chemObj.structure.antisense != undefined) {
                    templatestring = chemObj.structure.antisense;
                }
                if (templatestring === undefined) {
                    templatestring = chemObj;
                }

                console.log(" template string " + JSON.stringify(templatestring))
                if (templatestring.indexOf('{') >= 0) {
                    return Biopolymer.countBasesOligoScript(templatestring);
                }
                else {
                    return Biopolymer.countBasesOligoTemplate(templatestring)
                }
            }

            static createOligoFromTemplateUseSeqIn(chemObj, track, tstart, sequence, y, idv) {
                if (!y) {
                    y = track.y;
                }
                let base_count = sequence.length;
                console.log(' base count ' + base_count)
                if (!chemObj) {
                    chemObj = {
                        antisense: 'moe()sp.moe()sp.moe()sp.moe()sp.moe()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.moe()sp.moe()sp.moe()sp.moe()sp.moe()',
                        type: 'ASO'
                    }
                }
                let antisense = chemObj.antisense;
                if (!antisense) {
                    antisense = chemObj.template;
                }

                let sense = chemObj.sense;
                let type;
                if (chemObj.moltype) {
                    type = chemObj.moltype;
                } else if (chemObj.type) {
                    type = chemObj.type;
                }
                for (let c of sequence) {
                    antisense = antisense.replace('()', `(${c})`)
                }
                if (sense) {
                    if (!type) {
                        type = 'siRNA'
                    }
                    for (let c of sequence) {
                        sense = sense.replace('()', `(${c})`)
                    }
                }
                antisense = Biopolymer.normalizeStructure(antisense);
                if (sense) sense = Biopolymer.normalizeStructure(sense);
                let oligo = new Oligo(type, sequence, Biopolymer.wrapHelm(antisense), tstart, (tstart + base_count), y);
                oligo.strand = track.strand;
                if (track.strand < 0) {
                    oligo.synthesisSequence = sequence
                } else {
                    oligo.synthesisSequence = Biopolymer.reverseComp(sequence)
                }

                if (idv && idv.length > 0) {
                    oligo.id = idv;
                }
                Biopolymer.adjustOligo(track, oligo)
                track.addOligo(oligo);

            }
            static getTemplateLength(chemObj) {

                if (chemObj.length) {
                    return chemObj.length;
                }
                let template = chemObj.template;
                if (template != null && template.length > 0) {
                    let type = Biopolymer.getTemplateType(template)
                    if (type === 'HELM') {
                        return template.split('()').length - 1;
                    } else {
                        let base_count = Biopolymer.countBasesOligoScript(chem_template);
                        return base_count;
                    }
                }

            }

            static getTemplateType(t) {
                if (t.startsWith('[')) {
                    return 'OS'
                } else {
                    return 'HELM'
                }
            }

            static createOligoFromTemplate(chemObj, track, tstart, base_count, y) {
                console.log('debubg');
                if (!y) {
                    y = track.y;
                }
                if (!chemObj) {
                    chemObj = {
                        antisense: 'moe()sp.moe()sp.moe()sp.moe()sp.moe()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.moe()sp.moe()sp.moe()sp.moe()sp.moe()',
                        type: 'ASO'
                    }
                }

                let strand = track.strand;

                let sequence_index = Math.floor(tstart - track.xi);
                let sequence = track.getSequence();
                let antisense = chemObj.antisense;

                if (!antisense) {
                    antisense = chemObj.template;
                }

                let sense = chemObj.sense;
                let type = chemObj.type
                if (!type && chemObj.moltype) {
                    type = chemObj.moltype;
                }

                let subseq = sequence.substring(sequence_index, (sequence_index + base_count));
                let synthesisSeq = subseq;

                if (track.strand < 0) {
                    synthesisSeq = sequence   // reverse strand: ASO = genomic+ target (antisense to mRNA)
                } else {
                    synthesisSeq = Biopolymer.reverseComp(sequence)
                }

                for (let c of synthesisSeq) {
                    antisense = antisense.replace('()', `(${c})`)
                }
                if (sense) {
                    if (!type) {
                        type = 'siRNA'
                    }
                    for (let c of subseq) {
                        sense = sense.replace('()', `(${c})`)
                    }
                }
                // Guarantee every monomer symbol references the library.
                antisense = Biopolymer.normalizeStructure(antisense);
                if (sense) sense = Biopolymer.normalizeStructure(sense);
                if (type === 'siRNA') {
                    // SIRNA(type, sequence, sense, antisense, xi, xf, y, strand, structure)
                    let oligo = new SIRNA(type, synthesisSeq, sense, antisense, tstart, (tstart + base_count), y, track.strand);

                    track.addOligo(oligo);

                } else {

                    let oligo = new Oligo(type, subseq, Biopolymer.wrapHelm(antisense), tstart, (tstart + base_count), y);
                    oligo.strand = track.strand;

                    Biopolymer.adjustOligo(track, oligo)
                    track.addOligo(oligo);
                }
            }

            static adjustOligo(track, oligo) {
                for (let o of track.oligos) {
                    if (Biopolymer.rectanglesOverlap([oligo.xi - 1, oligo.y - 0.1], [oligo.xf, oligo.y + 0.1], [o.xi, o.y - 0.1], [o.xf, o.y + 0.1])) {
                        oligo.y += 0.1;
                        Biopolymer.adjustOligo(track, oligo);
                    }
                }
            }
            static rectanglesOverlap(topLeft1, bottomRight1, topLeft2, bottomRight2) {
                if (topLeft1[0] > bottomRight2[0] || topLeft2[0] > bottomRight1[0]) {
                    return false;
                }
                if (topLeft1[1] > bottomRight2[1] || topLeft2[1] > bottomRight1[1]) {
                    return false;
                }
                return true;
            }

            static applySequence(structure, sequence) {

                let split = structure.replace(/\[[A-Za-z]\]/g, '[?]')
                for (let c of sequence) {
                    split = split.replace('?', c)
                }
                console.log(' split ' + split);

                return split;
            }

            static createCompoundFromSequence(sequence, track, tstart, type) {
                tstart = Math.floor(tstart)
                let oligo = new Oligo(type, sequence, sequence, tstart, (tstart + sequence.length));
                oligo.strand = track;
                if (track.strand < 0) {
                    oligo.synthesisSequence = sequence
                } else {
                    oligo.synthesisSequence = Biopolymer.reverseComp(sequence)
                }

                track.addOligo(oligo);
            }

            static create(type, chain, sequence, tstart, base_count, y) {
                let template = ''

                if (type.toUpperCase() === 'ASO' || type.toUpperCase() === 'GAPMER' || type.toUpperCase() === 'SPLICING') {
                    let split = chain.split(/\{([0-9]*)\}/g)
                    for (let s = 0; s < split.length; s += 2) {
                        let co = split[s]
                        let count = +split[s + 1]
                        co = co.trim();
                        if (co.startsWith('(')) {
                            let temp = co.substring(1, co.length - 1)

                            for (let i = 0; i < count; i++) {
                                template += temp;
                            }
                        }
                    }
                    let reverse_complament = Biopolymer.comp(sequence)
                    console.log('s' + sequence);
                    console.log('r' + reverse_complament);
                    for (let c of reverse_complament) {
                        template = template.replace('?', c)
                    }

                    let anno = new Oligo(type, reverse_complament, sequence, tstart, (tstart + base_count), y);
                    oligo.strand = track.strand;
                    if (track.strand < 0) {
                        oligo.synthesisSequence = sequence
                    } else {
                        oligo.synthesisSequence = Biopolymer.reverseComp(sequence)
                    }

                    return anno;
                } else if (type.toUpperCase() === 'ASO') {
                    let split = chain.split(/\{([0-9]*)\}/g)
                    for (let s = 0; s < split.length; s += 2) {
                        let co = split[s]
                        let count = +split[s + 1]
                        co = co.trim();
                        if (co.startsWith('(')) {
                            let temp = co.substring(1, co.length - 1)

                            for (let i = 0; i < count; i++) {
                                template += temp;
                            }
                        }
                    }
                    let reverse_complament = Biopolymer.comp(sequence)
                    console.log('s' + sequence);
                    console.log('r' + reverse_complament);
                    for (let c of reverse_complament) {
                        template = template.replace('?', c)
                    }

                    let anno = new Oligo(type, reverse_complament, sequence, tstart, (tstart + base_count), y);
                    return anno;
                }

                return null;
            }

            static countBasesOligoScript(chain) {
                let total = 0;
                let split = chain.split(/\{([0-9]*)\}/g)
                for (let s = 0; s < split.length; s += 2) {
                    let co = split[s]
                    if (co != null && co.length > 0) {

                        let count = +split[s + 1]
                        co = co.trim();
                        let bases_per_chain = (co.match(/\[/g) || []).length;
                        total += bases_per_chain * count;
                    }

                }
                return total;
            }

            static countBasesOligoTemplate(chain) {
                let split = chain.split('(')

                if (!split) {
                    return 0;
                }
                return split.length - 1;
            }

            static reverse(str) {
                return Biopolymer.reverseString(str);
            }

            static reverseComp(str) {
                let s = Biopolymer.reverseString(str);
                return Biopolymer.comp(s)
            }
            static comp(s) {
                let a = '';
                s = s.toUpperCase();
                for (let c of s) {
                    if (c == 'A') {
                        a += 'T'
                    } else if (c == 'T') {
                        a += 'A'
                    } else if (c == 'G') {
                        a += 'C'
                    } else if (c == 'C') {
                        a += 'G'
                    }
                }
                return a;
            }

            static reverseString(str) {
                return str.split("").reverse().join("");
            }

        }

        resolve(Biopolymer);

    })

}
