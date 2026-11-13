function () {
    // WHAT A COMPOUND FILTER MEANS, in one place.
    //
    //   const F = await exec('baja/bio/compound-filter.js');
    //   const hits = F.match(list, spec);     // list: [{o, t}], spec: see below
    //
    // Two things ask this question -- the Select by criteria dialog, where a person sets the
    // fields, and the AI filter, where a model fills the same fields from a sentence -- and
    // they have to agree exactly. A model that says "17 compounds are self-complementary" and
    // a dialog that then selects 19 of them is worse than either on its own, because the
    // disagreement is invisible: both look right.
    //
    // So the spec is the contract between them, and this is the only code that reads it.
    //
    //   band          ''|'red'|'amber'|'notred'|'green'
    //   faults        subset of the keys in FAULTS; a compound matches if it carries ANY
    //   score_min/max, gc_min/max, tm_min/max, len_min/max    numbers or null
    //   modality      ''|'gapmer'|'steric'|'sirna'
    //   allele_only   bool
    //   name_contains string
    //
    // Everything reads a field the DESIGNER wrote on the compound, or the colour the renderer
    // gave it. Nothing is re-derived: a copy of "red means score under 10" here would be a
    // second answer to a question scoreToColor already answers, free to drift when the scale
    // moves.

    // The scorer's own words, keyed so a spec can name one. The patterns match the notes the
    // python designers write, which are also what track-design-menu.js builds the red label
    // from -- so a tick here and the text on the canvas mean the same thing.
    const FAULTS = [
        { key: 'gc', label: 'GC out of range', re: /GC outside preferred range/i },
        { key: 'tm', label: 'Tm out of range', re: /Tm outside preferred range/i },
        { key: 'cpg', label: 'CpG motif', re: /Contains CpG motif/i },
        { key: 'grun', label: 'Long G run', re: /Long G run detected/i },
        { key: 'pal', label: 'Palindromic (whole-strand dimer)', re: /Palindrome/i },
        { key: 'selfc', label: 'Self-complementary (hairpin or dimer)', re: /Self-complementary stretch detected/i },
        { key: 'rep', label: 'Repetitive', re: /Repetitive sequence/i }
    ];

    const MODALITIES = [
        { key: '', label: 'Any modality' },
        { key: 'gapmer', label: 'Gapmer' },
        { key: 'steric', label: 'Steric-blocking' },
        { key: 'sirna', label: 'siRNA' }
    ];

    const modalityOf = (o) => {
        const d = ('' + ((o && (o.designType || o.type)) || '')).toLowerCase();
        if (d.indexOf('steric') >= 0) return 'steric';
        if (d.indexOf('sirna') >= 0) return 'sirna';
        if (d.indexOf('gapmer') >= 0) return 'gapmer';
        return '';
    };

    // MISSING IS NOT ZERO. `+null` is 0 and `+''` is 0, so a compound carrying no GC at all
    // read as GC 0% and matched every "GC below" filter ever typed: a compound nothing is
    // known about turning up in a narrowed set, which is the opposite of narrowing.
    const num = (v) => {
        if (v == null || v === '') return null;
        const n = +v;
        return Number.isFinite(n) ? n : null;
    };

    const inRange = (v, lo, hi) => {
        if (lo == null && hi == null) return true;      // unconstrained passes everything
        if (v == null) return false;                    // ...but unknown fails a constraint
        if (lo != null && v < lo) return false;
        if (hi != null && v > hi) return false;
        return true;
    };

    // The fields, read off a compound the same way wherever they are read.
    const scoreOf = (o) => num(o && o.score);
    const gcOf = (o) => num(o && o.gc_percent);
    const tmOf = (o) => num(o && (o.tm_c != null ? o.tm_c : o.tm));
    const lenOf = (o) => num(o && (o.length != null ? o.length : (('' + (o.sequence || '')).length || null)));
    const isRed = (o) => !!(o && (o.color === 'red' || o.flagReason));
    const faultText = (o) => ((Array.isArray(o && o.notes) ? o.notes.join(' | ') : '')
        + ' | ' + ((o && o.flagReason) || ''));

    const matchOne = (o, spec) => {
        const s = spec || {};
        const col = ('' + ((o && o.color) || '')).toLowerCase();
        const red = isRed(o);
        if (s.band === 'red' && !red) return false;
        if (s.band === 'notred' && red) return false;
        if (s.band === 'amber' && !(red || col === 'orange')) return false;
        if (s.band === 'green' && col.indexOf('green') < 0) return false;
        if (s.modality && modalityOf(o) !== s.modality) return false;
        if (s.allele_only && !(o.alleleSelective || (o.alleleCols && o.alleleCols.length))) return false;
        if (s.name_contains && ('' + (o.name || '')).toLowerCase()
            .indexOf(('' + s.name_contains).toLowerCase()) < 0) return false;
        if (!inRange(scoreOf(o), num(s.score_min), num(s.score_max))) return false;
        if (!inRange(gcOf(o), num(s.gc_min), num(s.gc_max))) return false;
        if (!inRange(tmOf(o), num(s.tm_min), num(s.tm_max))) return false;
        if (!inRange(lenOf(o), num(s.len_min), num(s.len_max))) return false;
        const want = Array.isArray(s.faults) ? s.faults.filter((k) => FAULTS.some((f) => f.key === k)) : [];
        if (want.length) {
            const text = faultText(o);
            if (!want.some((k) => FAULTS.find((f) => f.key === k).re.test(text))) return false;
        }
        return true;
    };

    // list is [{o, t}]; returns the subset, in the order given.
    const match = (list, spec) => (list || []).filter((r) => r && r.o && matchOne(r.o, spec));

    // One sentence saying what a spec actually asks for, so a filter a model wrote can be
    // read back by the person about to act on it. "Everything" when nothing is constrained,
    // which is worth saying out loud before it selects the whole track.
    const describe = (spec) => {
        const s = spec || {};
        const bits = [];
        const BAND = { red: 'flagged (red)', amber: 'red or orange', notred: 'not flagged', green: 'best (green)' };
        if (BAND[s.band]) bits.push(BAND[s.band]);
        if (s.modality) {
            const m = MODALITIES.find((x) => x.key === s.modality);
            bits.push(m ? m.label.toLowerCase() : s.modality);
        }
        const want = Array.isArray(s.faults) ? s.faults : [];
        if (want.length) {
            bits.push('flagged for ' + want
                .map((k) => (FAULTS.find((f) => f.key === k) || { label: k }).label.replace(/ \(.*\)$/, ''))
                .join(' or '));
        }
        const range = (lo, hi, what, unit) => {
            const a = num(lo), b = num(hi);
            if (a == null && b == null) return null;
            if (a != null && b != null) return what + ' ' + a + '–' + b + (unit || '');
            return what + (a != null ? (' ≥ ' + a) : (' ≤ ' + b)) + (unit || '');
        };
        for (const r of [range(s.score_min, s.score_max, 'score', ''),
                         range(s.gc_min, s.gc_max, 'GC', '%'),
                         range(s.tm_min, s.tm_max, 'Tm', '°C'),
                         range(s.len_min, s.len_max, 'length', ' nt')]) if (r) bits.push(r);
        if (s.allele_only) bits.push('allele-selective');
        if (s.name_contains) bits.push('name contains “' + s.name_contains + '”');
        return bits.length ? bits.join(', ') : 'everything';
    };

    return {
        FAULTS: FAULTS, MODALITIES: MODALITIES,
        modalityOf: modalityOf, num: num, inRange: inRange,
        scoreOf: scoreOf, gcOf: gcOf, tmOf: tmOf, lenOf: lenOf, isRed: isRed,
        matchOne: matchOne, match: match, describe: describe
    };
}
