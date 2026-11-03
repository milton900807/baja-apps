function () {

    // Parse genomic variant text into { chr, chrLabel, pos, ref, alt, label, hgvs }.
    //
    //   const parse = await exec('baja/data/parse-genomic-variants.js');
    //   parse('chr16:1762843 C>T')        -> [{ chr: '16', chrLabel: 'chr16', pos: 1762843, ref: 'C', alt: 'T', ... }]
    //   parse.isGenomicVariantText(text)  -> true when EVERY non-empty line is one variant
    //
    // Accepted, one per line (case-insensitive chr prefix, optional "g."):
    //     chr16:1762843 C>T    chr16:1762843C>T    16:1762843 C>T    chr16:g.1762843C>T
    //     chr16-1762843-C-T    chr16:1762843:C:T   chr16 1762843 C T  chr16_1762843_C_T
    // REF and ALT are runs of A/C/G/T/N (VCF-style indels such as CT>C allowed). Chromosomes: 1-22, X, Y, M/MT.
    // A trailing build or note in parentheses ("(hg38)") is ignored.

    const CHR = '(?:chr)?([0-9]{1,2}|X|Y|M|MT)';
    const B = '([ACGTN]+)';
    const PATTERNS = [
        new RegExp('^' + CHR + ':(?:g\\.)?(\\d{1,10})\\s*' + B + '\\s*>\\s*' + B + '$', 'i'),   // chr16:1762843 C>T, chr16:g.1762843C>T
        new RegExp('^' + CHR + '[-:_](\\d{1,10})[-:_]' + B + '[-:_]' + B + '$', 'i'),           // chr16-1762843-C-T, chr16:1762843:C:T
        new RegExp('^' + CHR + '\\s+(\\d{1,10})\\s+' + B + '\\s+' + B + '$', 'i'),              // chr16 1762843 C T
    ];

    const parseLine = (line) => {
        let s = ('' + line).trim().replace(/\s*\([^)]*\)\s*$/, '').trim();   // drop a trailing "(hg38)"
        if (!s) return null;
        for (const re of PATTERNS) {
            const m = s.match(re);
            if (!m) continue;
            const c = m[1].toUpperCase().replace(/^MT$/, 'M');
            const pos = parseInt(m[2], 10);
            const ref = m[3].toUpperCase(), alt = m[4].toUpperCase();
            if (!isFinite(pos) || pos < 1 || ref === alt) return null;
            const chrLabel = 'chr' + c;
            return {
                chr: c, chrLabel, pos, ref, alt,
                label: chrLabel + ':' + pos + ' ' + ref + '>' + alt,
                hgvs: chrLabel + ':g.' + pos + ref + '>' + alt
            };
        }
        return null;
    };

    const parse = (text) => {
        const out = [];
        for (const line of ('' + (text || '')).split(/\r?\n/)) {
            const v = parseLine(line);
            if (v) out.push(v);
        }
        return out;
    };

    // True only when the paste is variants and nothing else, so a sentence or a table that merely
    // contains one is left to the routes that read those.
    parse.isGenomicVariantText = (text) => {
        const lines = ('' + (text || '')).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        return lines.length > 0 && lines.length <= 500 && lines.every((l) => !!parseLine(l));
    };
    parse.parseLine = parseLine;
    return parse;
}
