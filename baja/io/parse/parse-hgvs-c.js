function () {

    // Parse HGVS coding-sequence variants: c.709C>T and the rest of the c. grammar.
    //
    //   const P = await exec('baja/io/parse/parse-hgvs-c.js');
    //   P('c.709C>T')            -> [{ kind:'sub', pos:709, offset:0, region:'cds', ref:'C', alt:'T', … }]
    //   P.looksLikeHgvsC(text)   -> true when EVERY non-empty line is one c. variant
    //
    // Understood, with or without a transcript prefix (NM_000539.3:, ENST00000296930.9:,
    // DNM1(NM_004408.4):, a bare gene name:):
    //
    //   c.709C>T              substitution
    //   c.709del              one base deleted            c.709_711del      a run deleted
    //   c.709dup              one base duplicated         c.709_710dup      a run duplicated
    //   c.709_710insAT        bases inserted BETWEEN two positions
    //   c.709delinsGG         one base replaced by others c.709_711delinsG  a run replaced
    //
    // Positions follow the c. grammar: a plain number inside the CDS, -n in the 5' UTR, *n in
    // the 3' UTR, and either of those plus an intronic offset (c.709+3, c.710-2, c.*12+1).
    // r. and n. are accepted as the same shape, since the arithmetic is identical; p. (protein)
    // is NOT, because a residue is not a base and guessing which codon position was meant would
    // be inventing data.
    //
    // Each result: { kind, pos, offset, region, posEnd, offsetEnd, regionEnd, ref, alt, prefix,
    //                label, raw }  with kind 'sub' | 'del' | 'dup' | 'ins' | 'delins'.
    const POS = '(\\*|-)?(\\d{1,9})([+-]\\d{1,6})?';
    const mkPos = (star, num, off) => ({
        region: star === '*' ? 'utr3' : (star === '-' ? 'utr5' : 'cds'),
        pos: star === '-' ? -parseInt(num, 10) : parseInt(num, 10),
        offset: off ? parseInt(off, 10) : 0
    });
    // <prefix>:  c. | r. | n.  <pos>[ _<pos>] <change>
    const RE = new RegExp(
        '^\\s*(?:([A-Za-z0-9_.()-]+)\\s*:\\s*)?[crn]\\.\\s*'
        + POS + '(?:_' + POS + ')?'
        + '\\s*(?:'
        + '([ACGTU]+)\\s*>\\s*([ACGTU]+)'            // 5,6  sub
        + '|delins([ACGTU]+)'                        // 7    delins
        + '|del([ACGTU]*)'                           // 8    del
        + '|dup([ACGTU]*)'                           // 9    dup
        + '|ins([ACGTU]+)'                           // 10   ins
        + ')\\s*$', 'i');

    const one = (line) => {
        const s = ('' + (line == null ? '' : line)).trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
        if (!s) return null;
        const m = s.match(RE);
        if (!m) return null;
        const a = mkPos(m[2], m[3], m[4]);
        const b = m[6] ? mkPos(m[5], m[6], m[7]) : null;
        const up = (v) => ('' + (v || '')).toUpperCase().replace(/U/g, 'T');
        let kind, ref = '', alt = '';
        if (m[8] && m[9]) { kind = 'sub'; ref = up(m[8]); alt = up(m[9]); }
        else if (m[10] != null && m[10] !== '') { kind = 'delins'; alt = up(m[10]); }
        else if (m[11] != null) { kind = 'del'; ref = up(m[11]); }
        else if (m[12] != null) { kind = 'dup'; ref = up(m[12]); }
        else if (m[13]) { kind = 'ins'; alt = up(m[13]); }
        else return null;
        // An insertion is written between two positions, so it needs both; everything else may
        // name one position or a range.
        if (kind === 'ins' && !b) return null;
        if (kind === 'sub' && b) return null;
        return {
            kind: kind, prefix: m[1] || '', raw: s,
            pos: a.pos, offset: a.offset, region: a.region,
            posEnd: b ? b.pos : a.pos, offsetEnd: b ? b.offset : a.offset, regionEnd: b ? b.region : a.region,
            ref: ref, alt: alt,
            label: (m[1] ? m[1] + ':' : '') + s.replace(/^.*?[crn]\./i, 'c.')
        };
    };

    const parse = (text) => {
        const out = [];
        for (const line of ('' + (text || '')).split(/[\r\n,;]+/)) {
            const v = one(line);
            if (v) out.push(v);
        }
        return out;
    };
    // Only when the paste is c. variants and nothing else: a sentence that happens to mention
    // one belongs to the routes that read sentences.
    parse.looksLikeHgvsC = (text) => {
        const lines = ('' + (text || '')).split(/[\r\n,;]+/).map((l) => l.trim()).filter(Boolean);
        return lines.length > 0 && lines.length <= 500 && lines.every((l) => !!one(l));
    };
    parse.one = one;
    return parse;
}
