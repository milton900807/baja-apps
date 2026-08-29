function (graph, genegraph_panel_layout, mutationSpec, options) {
    // PROTEIN-MUTATION -> TRACK (by peptide match).
    //
    // Given a protein-style mutation (e.g. "ARG521Cys", "R521C", "p.Arg521Cys"), find the most
    // likely track by TRANSLATING each candidate track's coding sequence and checking that the
    // WILDTYPE amino acid at the stated position matches — "Arg521Cys" must land on a peptide
    // whose residue 521 is Arg. The best matching track then gets a DEGENERATE SnpIndel at that
    // residue's codon (the exact nucleotide is inferred from the amino-acid change, so ambiguous
    // codons are flagged degenerate).
    //
    //   let r = await exec('baja/manchester/menu/protein-mutation-to-track.js',
    //                      graph, genegraph_panel_layout, 'ARG521Cys', { gene: 'FUS' });
    //   // r = { track, snp, ref:'R', pos:521, alt:'C', degenerate:false, candidates:1 } | null
    //
    // Params:
    //   mutationSpec : a string ("ARG521Cys" / "R521C" / "p.Arg521Cys"), OR an object
    //                  { label|protein|hgvs, gene, id, comment }. If omitted, the user is
    //                  prompted for one.
    //   options      : { tracks:[track], gene, color, name, comment, place:true }
    //                  - tracks : candidate tracks (default: all loaded tracks)
    //                  - gene   : gene-symbol hint to break ties toward a track whose name matches
    //                  - place  : false to only LOCATE (returns the target) without adding a SnpIndel
    return (async () => {
        const opts = options || {};
        const SnpIndel = await exec('flexigraph/snpindel.js');
        const COLOR = opts.color || '#dc2626';

        // ---- amino-acid + codon tables --------------------------------------------------
        const AA1 = 'ACDEFGHIKLMNPQRSTVWY';
        const AA3to1 = {
            ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G',
            HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S',
            THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V', TER: '*', STOP: '*'
        };
        const CODONS = (() => {
            const T = {
                TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L', CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
                ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M', GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
                TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S', CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
                ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T', GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
                TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*', CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
                AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K', GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
                TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W', CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
                AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R', GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G'
            };
            const byAa = {};
            for (const c in T) { (byAa[T[c]] = byAa[T[c]] || []).push(c); }
            return byAa;   // AA(1-letter) -> [codons]
        })();
        const IUPAC = (bases) => {
            const s = Array.from(new Set(bases)).sort().join('');
            return ({ A: 'A', C: 'C', G: 'G', T: 'T', AG: 'R', CT: 'Y', CG: 'S', AT: 'W', GT: 'K', AC: 'M', CGT: 'B', AGT: 'D', ACT: 'H', ACG: 'V', ACGT: 'N' })[s] || 'N';
        };

        // ---- parse the mutation spec into a missense substitution { ref, pos, alt } ------
        // Accepts a raw string or an entity object (label/protein/hgvs). Rejects anything that
        // is not a simple single-residue substitution (frameshift / indel / synonymous / stop).
        const parseMissense = (spec) => {
            let src = '';
            let gene = opts.gene || '';
            if (spec && typeof spec === 'object') {
                src = spec.protein || spec.hgvs || spec.label || '';
                gene = gene || spec.gene || '';
            } else {
                src = '' + (spec || '');
            }
            src = ('' + src).replace(/^p\.?/i, '').replace(/[()]/g, '').trim();
            if (!src) return null;
            if (/fs|del|ins|dup|frameshift|splice|ext/i.test(src)) return null;
            let ref = '', alt = '', pos = 0;
            // 3-letter form, e.g. Arg521Cys / ARG521CYS / Arg521Ter
            let mm = src.match(/([A-Za-z]{3})\s*(\d{1,6})\s*([A-Za-z]{3}|\*)/);
            if (mm && (AA3to1[mm[1].toUpperCase()] || mm[3] === '*')) {
                ref = AA3to1[mm[1].toUpperCase()] || '';
                alt = (mm[3] === '*') ? '*' : (AA3to1[mm[3].toUpperCase()] || '');
                pos = +mm[2];
            } else {
                // 1-letter form, e.g. R521C (may be embedded in prose)
                mm = src.match(/\b([A-Za-z])\s*(\d{1,6})\s*([A-Za-z\*])\b/);
                if (!mm) return null;
                ref = mm[1].toUpperCase(); alt = mm[3].toUpperCase(); pos = +mm[2];
            }
            if (!(pos >= 1)) return null;
            if (AA1.indexOf(ref) < 0) return null;                                  // ref must be a real amino acid
            if (alt === '*' || alt === 'X' || AA1.indexOf(alt) < 0) return null;    // stop/unknown -> not missense
            if (ref === alt) return null;                                           // synonymous -> not missense
            return { ref, pos, alt, gene };
        };

        // ---- CDS (protein + per-residue genomic codon positions), cached per track -------
        const cdsCache = new Map();
        const getCds = (t) => {
            if (!t) return null;
            if (cdsCache.has(t)) return cdsCache.get(t);
            let cds = null;
            try { t.generateORF(); cds = t.getCDS(); } catch (e) { }
            if (!(cds && cds.protein && ('' + cds.protein).length >= 3 && Array.isArray(cds.codonPos) && cds.codonPos.length)) cds = null;
            cdsCache.set(t, cds);
            return cds;
        };

        // ---- degenerate codon change: residue `pos` on this track -> nucleotide change ----
        const degenerateChange = (cds, pos, altAA, strand) => {
            let bases = [];   // [{ index (genomic), nt }] for this residue's 3 codon bases
            try {
                for (const e of (cds.cdsi || [])) {
                    if (e && e.codon_index === (pos - 1)) bases.push({ index: e.index, nt: (('' + e.codon).toUpperCase().charAt(e.ci) || 'N') });
                }
            } catch (e) { }
            const gi0 = cds.codonPos[pos - 1];
            if (bases.length !== 3) return { xi: gi0, ref: 'N', alt: 'N', type: 'snp', degenerate: true };
            bases.sort((a, b) => (strand >= 0 ? a.index - b.index : b.index - a.index));   // transcript 5'->3'
            const refCodon = bases.map((b) => b.nt).join('');
            const alts = CODONS[altAA] || [];
            let best = null;
            for (const c of alts) {
                let dist = 0; for (let d = 0; d < 3; d++) if (c[d] !== refCodon[d]) dist++;
                if (!best || dist < best.dist) best = { dist, options: [c] };
                else if (dist === best.dist) best.options.push(c);
            }
            if (!best || best.dist === 0) return { xi: gi0, ref: 'N', alt: 'N', type: 'snp', degenerate: true };
            if (best.dist === 1) {
                let d = -1; const c0 = best.options[0]; for (let i = 0; i < 3; i++) if (c0[i] !== refCodon[i]) { d = i; break; }
                const altBases = best.options.filter((c) => { let n = 0, dd = -1; for (let i = 0; i < 3; i++) if (c[i] !== refCodon[i]) { n++; dd = i; } return n === 1 && dd === d; }).map((c) => c[d]);
                const degenerate = new Set(altBases).size > 1;
                return { xi: bases[d].index, ref: refCodon[d], alt: (degenerate ? IUPAC(altBases) : altBases[0]), type: 'snp', degenerate, refCodon };
            }
            return { xi: bases[0].index, ref: refCodon, alt: best.options[0], type: 'delins', degenerate: true, refCodon };
        };

        // ---- 1) parse (prompt if nothing supplied) --------------------------------------
        let spec = mutationSpec;
        if (!spec) {
            try {
                const va = await prompt('Protein mutation', ['Mutation'], { 'Mutation': 'Arg521Cys' }, 400, 200);
                spec = va && va['Mutation'];
            } catch (e) { }
        }
        const mis = parseMissense(spec);
        if (!mis) { try { graph.setMessage(' Not a protein missense mutation (need e.g. Arg521Cys / R521C). '); } catch (e) { } return null; }

        // ---- 2) score candidate tracks by WILDTYPE peptide match at that position --------
        // The correct track is one whose translated peptide has the reference amino acid at the
        // stated residue (the wildtype). Ties break toward a gene-name hint, then the shorter
        // (more specific) protein. `candidates` counts how many tracks satisfy the wildtype match.
        const geneHint = ('' + (mis.gene || '')).toLowerCase().trim();
        const cands = (opts.tracks && opts.tracks.length) ? opts.tracks : (graph.track || []);
        let best = null, matches = 0;
        for (const t of cands) {
            const cds = getCds(t);
            if (!cds || mis.pos > ('' + cds.protein).length) continue;
            const wt = ('' + cds.protein).charAt(mis.pos - 1).toUpperCase();
            if (wt !== mis.ref) continue;                      // wildtype residue must match
            matches++;
            let score = 1;
            if (geneHint && ('' + (t.name || '')).toLowerCase().indexOf(geneHint) >= 0) score += 1000;
            score += Math.max(0, 200000 - ('' + cds.protein).length) / 1e7;   // tiny tiebreak: prefer shorter protein
            if (!best || score > best.score) best = { t, cds, score };
        }
        if (!best) {
            try { graph.setMessage(' No loaded track has ' + mis.ref + ' at residue ' + mis.pos + ' — cannot place ' + mis.ref + mis.pos + mis.alt + '. '); } catch (e) { }
            return null;
        }

        // ---- 3) create the SnpIndel spanning the WHOLE CODON, marked a PEPTIDE mutation -------
        // An amino-acid change is a peptide mutation: highlight the entire codon (3 nt) even
        // though the underlying change is a single nucleotide, and NEVER render a nucleotide
        // change (the exact base is degenerate). reference is 3 nt so xf spans the codon.
        let cbases = [];
        try { for (const e of (best.cds.cdsi || [])) { if (e && e.codon_index === (mis.pos - 1)) cbases.push(e); } } catch (e) { }
        let gi, refCodon;
        if (cbases.length === 3) {
            gi = Math.min(cbases[0].index, cbases[1].index, cbases[2].index);
            const cc = ('' + (cbases[0].codon || '')).toUpperCase().replace(/[^ACGTUN]/g, '').replace(/U/g, 'T').slice(0, 3);
            refCodon = (cc.length === 3) ? cc : 'NNN';
        } else {
            gi = best.cds.codonPos[mis.pos - 1];   // fallback: codon start, still a 3-nt span
            refCodon = 'NNN';
        }
        const label = mis.ref + mis.pos + mis.alt;
        const result = { track: best.t, snp: null, ref: mis.ref, pos: mis.pos, alt: mis.alt, peptide: true, candidates: matches, xi: gi };
        if (opts.place === false) return result;    // locate-only
        if (gi == null || !isFinite(gi)) return result;

        let snp = (best.t.snpindels || []).find((x) => x && Math.round(x.xi) === Math.round(gi));
        if (!snp) {
            // Type 'AA' = amino-acid (peptide) mutation — a missense substitution with unknown
            // nucleotide, drawn spanning the whole codon (never confused with a deletion).
            snp = new SnpIndel('AA', gi, refCodon, refCodon, 0, best.t.strand, COLOR);
            try { snp.color = COLOR; } catch (e) { }
            best.t.addsnpindel(snp);
        }
        try { snp.peptide = true; } catch (e) { }
        try { snp.name = (opts.name || label); } catch (e) { }
        try {
            const idp = (spec && typeof spec === 'object' && spec.id) ? (spec.id + ' — ') : '';
            const base = opts.comment || (spec && typeof spec === 'object' && spec.comment) || '';
            snp.comment = idp + base;
        } catch (e) { }
        best.t.showSnpIndels = true;
        try { if (best.t.fitYAxis) best.t.fitYAxis(); } catch (e) { }
        try { if (graph.wake) graph.wake(); } catch (e) { }
        result.snp = snp;
        return result;
    })();
}
