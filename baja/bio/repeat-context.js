function () {
    // THE REPEAT A VARIANT SITS IN, and what that costs a design.
    //
    // A variant inside a tandem repeat is not discriminated by a base. It is discriminated by
    // the LENGTH of the run: every register that falls wholly inside the run presents a target
    // the wild-type copy also presents, so it binds both copies, and the only oligos that can
    // tell the two apart are the ones that span the whole run and reach both flanks. Against a
    // long run that is a handful of registers out of twenty, all of them necessarily pinned to
    // the same flank.
    //
    // That is a correct result which looks exactly like a truncated walk, which is why it is
    // said rather than left to be worked out from the picture. Here rather than in either
    // caller because both the register walk and the click-through designer hit it, and two
    // copies of this would be two chances to describe the same sequence differently.

    // The longest tandem repeat covering [i0, i1], unit length 1..6, or null.
    //
    // Periodicity rather than literal repetition: a stretch has period u where seq[k] equals
    // seq[k + u] throughout, which finds the run whatever phase it is read in and does not
    // care that the flanks interrupt it. Units are tried shortest first and only a STRICTLY
    // longer stretch replaces the incumbent, so a homopolymer is reported as a run of one base
    // and not as a run of two-base units that happen to match.
    const repeatAround = (seq, i0, i1) => {
        const s = '' + (seq || '');
        if (!s || i0 == null || i1 == null || i0 < 0 || i1 >= s.length || i1 < i0) return null;
        let best = null;
        for (let u = 1; u <= 6; u++) {
            let a = i0, b = i1;
            while (a - 1 >= 0 && a - 1 + u < s.length && s[a - 1] === s[a - 1 + u]) a--;
            while (b + 1 < s.length && b + 1 - u >= 0 && s[b + 1] === s[b + 1 - u]) b++;
            const len = b - a + 1;
            // Long enough to be a repeat rather than a coincidence: three copies of the unit,
            // and never fewer than six bases.
            if (len >= Math.max(6, u * 3) && (!best || len > best.len)) {
                best = { unit: s.slice(a, a + u), len: len, copies: Math.floor(len / u), start: a, end: b };
            }
        }
        return best;
    };

    // One sentence for a result message, or '' when the variant is in unique sequence. Begins
    // with a space so it appends to whatever came before it.
    const sentence = (name, ctx) => {
        if (!ctx) return '';
        const run = (ctx.unit.length === 1)
            ? (ctx.len + ' ' + ctx.unit)
            : (ctx.copies + ' copies of ' + ctx.unit);
        return ' ' + (name || 'The variant') + ' sits in a run of ' + run
            + ', so the two copies differ in the LENGTH of that run and not in any one base: '
            + 'only an oligo spanning the whole run and reaching both flanks reads differently '
            + 'on them, and every register that falls inside the run is identical on both.';
    };

    return { repeatAround: repeatAround, sentence: sentence };
}
