function (track) {

    // THE PEPTIDE A TRACK ACTUALLY MAKES, from its own ORF.
    //   const pep = await exec('baja/bio/protein/peptide-of.js', track);   // '' when it has none
    //
    // Taken from the ORF the editor draws, walked codon by codon and stopped at the stop,
    // so what is compared is what is on screen. A track with no ORF has no peptide and
    // gets an empty string: translating it in some arbitrary frame would produce a
    // sequence nobody has, and a number about it that reads like an answer.
    //
    // ONE OF THESE. The protein comparison had its own copy and the exon plan search
    // wanted the same thing; two of them is two answers to "what does this track
    // translate to", which can only ever diverge.

    const t = track || {};
    let orf = null;
    try { orf = t.orf; } catch (e) { orf = null; }
    if (!orf || !orf.cdsi || !orf.cdsi.length) {
        try { if (t.generateORF) t.generateORF(); } catch (e) { }
        try { orf = t.orf; } catch (e) { orf = null; }
    }
    if (!orf || !orf.cdsi || !orf.cdsi.length) return '';
    if (orf.protein && typeof orf.protein === 'string') {
        return orf.protein.replace(/[^A-Za-z]/g, '').toUpperCase();
    }
    const out = [], seen = {};
    for (const c of orf.cdsi) {
        if (!c || c.ci !== 0 || seen[c.codon_index]) continue;
        seen[c.codon_index] = 1;
        const aa = '' + (c.aa || '');
        if (!aa || /^stop$/i.test(aa)) break;
        if (aa.length === 1) out.push(aa.toUpperCase());
        else if (/^start$/i.test(aa)) out.push('M');
    }
    return out.join('');
}
