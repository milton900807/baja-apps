function () {

    // FROM A VARIANT TO A PAIR OF PROTEIN SEQUENCES.
    //
    // Everything downstream compares a MUTANT window against the WILD-TYPE window at the
    // same place, so this module's job is to produce both, and to refuse to produce either
    // when it cannot be sure they are right. A neoantigen pipeline that silently applies a
    // p.G12D to a protein whose residue 12 is not glycine will produce a beautiful, ranked,
    // entirely fictional shortlist.
    //
    // Supported changes:
    //   missense            p.G12D, G12D, p.Gly12Asp
    //   in-frame deletion   p.E746_A750del, p.K23del
    //   in-frame insertion  p.K23_L24insPWT
    //   in-frame delins     p.L747_T751delinsS
    //   nonsense            p.Q61*  -- accepted, and flagged: a stop CREATES no neo-peptide
    //                       sequence, so there is nothing to enumerate unless the truncation
    //                       itself is the point.
    //   frameshift          p.K132fs -- accepted ONLY with the novel downstream peptide
    //                       supplied, because it cannot be derived from the protein sequence
    //                       alone. The neo-ORF is where frameshift neoantigens come from and
    //                       it needs the transcript, not the protein.
    //   free peptide        a mutant peptide with (optionally) its wild-type counterpart,
    //                       for people arriving from a pipeline that already did this step.

    const THREE_TO_ONE = {
        ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G',
        HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S',
        THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V', TER: '*', STOP: '*', SEC: 'U', XAA: 'X'
    };

    const one = (tok) => {
        const t = ('' + tok).toUpperCase();
        if (t.length === 1) return t;
        if (t === '*' || t === 'TER') return '*';
        return THREE_TO_ONE[t] || '';
    };
    const cleanAa = (s) => ('' + (s == null ? '' : s)).toUpperCase().replace(/[^ACDEFGHIKLMNPQRSTVWY*]/g, '');

    // ---- parsing -------------------------------------------------------------------------
    //
    // Returns {kind, ...} or {kind:'error', message}. Deliberately strict: an unparsed
    // string is an error the user sees, not a row quietly dropped from the run.
    const parse = (text) => {
        let s = ('' + (text == null ? '' : text)).trim();
        if (!s) return { kind: 'error', message: 'empty' };
        s = s.replace(/^p\./i, '').replace(/^\(/, '').replace(/\)$/, '').replace(/\s+/g, '');
        const AA = '(?:[A-Z]|[A-Z][a-z]{2})';

        // delins first: it is a superset of del and would be mis-read as one.
        let mm = s.match(new RegExp('^(' + AA + ')([0-9]+)_(' + AA + ')([0-9]+)delins([A-Za-z]+)$', 'i'));
        if (mm) return { kind: 'delins', from: +mm[2], to: +mm[4], fromAa: one(mm[1]), toAa: one(mm[3]), ins: cleanAa(mm[5].replace(/(...)/g, (x) => one(x) || x)) || cleanAa(mm[5]) };

        mm = s.match(new RegExp('^(' + AA + ')([0-9]+)_(' + AA + ')([0-9]+)del$', 'i'));
        if (mm) return { kind: 'del', from: +mm[2], to: +mm[4], fromAa: one(mm[1]), toAa: one(mm[3]) };

        mm = s.match(new RegExp('^(' + AA + ')([0-9]+)del$', 'i'));
        if (mm) return { kind: 'del', from: +mm[2], to: +mm[2], fromAa: one(mm[1]), toAa: one(mm[1]) };

        mm = s.match(new RegExp('^(' + AA + ')([0-9]+)_(' + AA + ')([0-9]+)ins([A-Za-z]+)$', 'i'));
        if (mm) return { kind: 'ins', after: +mm[2], fromAa: one(mm[1]), nextAa: one(mm[3]), ins: cleanAa(mm[5]) };

        mm = s.match(new RegExp('^(' + AA + ')([0-9]+)(fs.*)$', 'i'));
        if (mm) return { kind: 'fs', at: +mm[2], fromAa: one(mm[1]) };

        mm = s.match(new RegExp('^(' + AA + ')([0-9]+)(\\*|Ter)$', 'i'));
        if (mm) return { kind: 'nonsense', at: +mm[2], fromAa: one(mm[1]) };

        mm = s.match(new RegExp('^(' + AA + ')([0-9]+)(' + AA + ')$', 'i'));
        if (mm) {
            const f = one(mm[1]), t = one(mm[3]);
            if (!f || !t) return { kind: 'error', message: 'unrecognised amino acid in "' + text + '"' };
            if (f === t) return { kind: 'error', message: '"' + text + '" is not a change: the two residues are the same' };
            return { kind: 'missense', at: +mm[2], fromAa: f, toAa: t };
        }

        return { kind: 'error', message: 'could not read "' + text + '" as a protein change' };
    };

    // ---- applying --------------------------------------------------------------------------
    //
    // apply(wtProtein, change, extra) -> {ok, mutant, wt, novelFrom, novelTo, note} where
    // novelFrom/novelTo are the 0-based half-open span of the MUTANT sequence that is new.
    // Every peptide enumerated later must overlap that span; that is the whole definition of
    // a neo-peptide and it is computed once, here.
    const apply = (wtProtein, change, extra) => {
        const wt = cleanAa(wtProtein).replace(/\*+$/, '');
        const ex = extra || {};
        if (!wt.length && change.kind !== 'peptide') return { ok: false, message: 'no wild-type protein sequence' };

        const at = (n) => n - 1;                       // HGVS is 1-based
        const checkRef = (pos, expect) => {
            if (!expect || expect === 'X') return '';
            const got = wt[at(pos)];
            if (!got) return 'position ' + pos + ' is past the end of a ' + wt.length + '-residue protein';
            if (got !== expect) return 'the protein has ' + got + ' at position ' + pos + ', not ' + expect;
            return '';
        };

        if (change.kind === 'missense') {
            const bad = checkRef(change.at, change.fromAa);
            if (bad) return { ok: false, message: bad };
            const i = at(change.at);
            const mutant = wt.slice(0, i) + change.toAa + wt.slice(i + 1);
            return { ok: true, mutant: mutant, wt: wt, novelFrom: i, novelTo: i + 1, aligned: true, note: '' };
        }

        if (change.kind === 'nonsense') {
            const bad = checkRef(change.at, change.fromAa);
            if (bad) return { ok: false, message: bad };
            const i = at(change.at);
            return {
                ok: true, mutant: wt.slice(0, i), wt: wt, novelFrom: i, novelTo: i, aligned: false,
                note: 'A stop codon removes sequence rather than creating any. There is no novel '
                    + 'peptide to enumerate; this row is carried for the record only.'
            };
        }

        if (change.kind === 'del') {
            let bad = checkRef(change.from, change.fromAa) || checkRef(change.to, change.toAa);
            if (bad) return { ok: false, message: bad };
            const a = at(change.from), b = at(change.to) + 1;
            const mutant = wt.slice(0, a) + wt.slice(b);
            // The new sequence is the JUNCTION: the residues either side now sit together
            // and any peptide spanning that seam is novel.
            return { ok: true, mutant: mutant, wt: wt, novelFrom: Math.max(0, a - 1), novelTo: Math.min(mutant.length, a + 1), aligned: false, note: '' };
        }

        if (change.kind === 'ins') {
            const bad = checkRef(change.after, change.fromAa);
            if (bad) return { ok: false, message: bad };
            const a = at(change.after) + 1;
            const ins = cleanAa(change.ins);
            if (!ins.length) return { ok: false, message: 'the inserted residues are missing' };
            const mutant = wt.slice(0, a) + ins + wt.slice(a);
            return { ok: true, mutant: mutant, wt: wt, novelFrom: a, novelTo: a + ins.length, aligned: false, note: '' };
        }

        if (change.kind === 'delins') {
            let bad = checkRef(change.from, change.fromAa) || checkRef(change.to, change.toAa);
            if (bad) return { ok: false, message: bad };
            const a = at(change.from), b = at(change.to) + 1;
            const ins = cleanAa(change.ins);
            const mutant = wt.slice(0, a) + ins + wt.slice(b);
            return { ok: true, mutant: mutant, wt: wt, novelFrom: a, novelTo: a + Math.max(1, ins.length), aligned: false, note: '' };
        }

        if (change.kind === 'fs') {
            const bad = checkRef(change.at, change.fromAa);
            if (bad) return { ok: false, message: bad };
            const novel = cleanAa(ex.neoPeptide || '');
            if (!novel.length) {
                return {
                    ok: false,
                    message: 'a frameshift needs its novel downstream peptide. It cannot be '
                        + 'derived from the protein sequence -- read it off the mutant transcript '
                        + 'and paste it into the "novel peptide" field.'
                };
            }
            const i = at(change.at);
            const mutant = wt.slice(0, i) + novel;
            return {
                ok: true, mutant: mutant, wt: wt, novelFrom: i, novelTo: mutant.length, aligned: false,
                note: 'Frameshift: everything from residue ' + change.at + ' is novel, so every '
                    + 'peptide in that stretch is a candidate -- this is why frameshifts are the '
                    + 'richest source of neoantigens per mutation.'
            };
        }

        if (change.kind === 'peptide') {
            const mutant = cleanAa(change.mutant);
            if (!mutant.length) return { ok: false, message: 'no mutant peptide' };
            const wtp = cleanAa(change.wt || '');
            // With a wild-type counterpart of the same length, the novel span is exactly the
            // residues that differ. Without one, the whole peptide is treated as novel.
            let from = 0, to = mutant.length;
            if (wtp.length === mutant.length) {
                let f = -1, t = -1;
                for (let i = 0; i < mutant.length; i++) if (mutant[i] !== wtp[i]) { if (f < 0) f = i; t = i + 1; }
                if (f >= 0) { from = f; to = t; }
            }
            return { ok: true, mutant: mutant, wt: wtp || mutant, novelFrom: from, novelTo: to, aligned: wtp.length === mutant.length, note: '' };
        }

        return { ok: false, message: change.message || 'unsupported change' };
    };

    // A short human label for a parsed change.
    const label = (change) => {
        switch (change.kind) {
            case 'missense': return 'p.' + change.fromAa + change.at + change.toAa;
            case 'nonsense': return 'p.' + change.fromAa + change.at + '*';
            case 'del': return 'p.' + change.fromAa + change.from + (change.from === change.to ? '' : '_' + change.toAa + change.to) + 'del';
            case 'ins': return 'p.' + change.fromAa + change.after + '_ins' + change.ins;
            case 'delins': return 'p.' + change.fromAa + change.from + '_' + change.toAa + change.to + 'delins' + change.ins;
            case 'fs': return 'p.' + change.fromAa + change.at + 'fs';
            case 'peptide': return 'peptide';
            default: return change.message || '?';
        }
    };

    return { parse: parse, apply: apply, label: label, one: one, cleanAa: cleanAa, THREE_TO_ONE: THREE_TO_ONE };
}
