function (track) {

    // THE NAMED REGIONS OF A TRANSCRIPT, as spans in the track's own coordinates.
    //   const R = await exec('baja/bio/track-regions.js', track);
    //   R.resolve({ region: 'three_prime_utr' })   -> { start, end, label } | { error }
    //   R.resolve({ region: 'exon', index: 3 })
    //   R.available()                              -> what this track can actually offer
    //
    // The editor draws 5' and 3' UTR labels but never had them as spans: they are derived
    // on the fly inside draw() from the track's extent and the Translation annotation, and
    // thrown away. Anything that wants to ACT on a region -- select it, design against it,
    // run a model over it -- had to redo that derivation, so it is done here once.
    //
    // COORDINATES ARE GENOMIC ORDER, ORIENTATION IS NOT. A track's local coordinates always
    // run low to high, but a minus-strand transcript runs high to low along them: its 5' end
    // is at the HIGH coordinate and its first exon is the last one by position. So every
    // span returned here is {start, end} with start < end, ready for markstart/markend, while
    // anything ORDINAL -- which exon is exon 1, which UTR is the 5' one -- is counted along
    // the transcript. Getting that backwards gives a 3' UTR that is really the 5' UTR, on
    // exactly the genes where it matters most.

    const T = track;
    const num = (v) => { const n = +v; return Number.isFinite(n) ? n : null; };
    const minus = () => {
        try { return (T.strand === -1 || T.strand === '-1' || T.strand === '-'); }
        catch (e) { return false; }
    };
    const span = (a, b) => {
        const lo = Math.min(a, b), hi = Math.max(a, b);
        if (!isFinite(lo) || !isFinite(hi) || hi - lo < 1) return null;
        return { start: Math.floor(lo), end: Math.ceil(hi) };
    };

    // The Translation annotation is the coding span. Without it a transcript has no UTRs
    // and no CDS that this can point at -- which is the honest answer for a non-coding
    // track, and better than treating the whole transcript as coding.
    const translation = () => {
        try {
            for (const a of (T.annotations || [])) if (a && a.type === 'Translation') return a;
        } catch (e) { }
        return null;
    };

    // Exons in TRANSCRIPT order, so index 1 is the first one transcribed.
    const exons = () => {
        let list = [];
        try { list = (T.annotations || []).filter((a) => a && a.type === 'Exon' && isFinite(a.xi) && isFinite(a.xf)); }
        catch (e) { list = []; }
        list = list.slice().sort((a, b) => (Math.min(a.xi, a.xf) - Math.min(b.xi, b.xf)));
        if (minus()) list.reverse();
        return list;
    };

    // Introns are the gaps BETWEEN consecutive exons, in the same order, so intron 1 follows
    // exon 1. Derived rather than read off annotations because an intron is not a feature
    // the track carries: it is what is left over, which is also why a single-exon transcript
    // correctly has none.
    const introns = () => {
        // Built from exons in POSITION order -- an intron is the gap between neighbours on
        // the coordinate line -- and only then turned round for a minus-strand transcript,
        // so intron 1 is the one after exon 1 on both strands.
        const byPos = exons().slice().sort((a, b) => (Math.min(a.xi, a.xf) - Math.min(b.xi, b.xf)));
        const gaps = [];
        for (let i = 0; i + 1 < byPos.length; i++) {
            const left = byPos[i], right = byPos[i + 1];
            const g = span(Math.max(left.xi, left.xf), Math.min(right.xi, right.xf));
            if (g) gaps.push(g);
        }
        if (minus()) gaps.reverse();
        return gaps;
    };

    const whole = () => span(T.xi, T.xf);

    const utr = (which) => {
        const t = translation();
        if (!t) return null;
        const w = whole();
        if (!w) return null;
        // Plus strand: 5' is everything before the CDS, 3' is everything after. Minus strand
        // is the mirror of that, which is the whole point of deriving it here.
        const m = minus();
        if (which === 5) return m ? span(Math.max(t.xi, t.xf), w.end) : span(w.start, Math.min(t.xi, t.xf));
        return m ? span(w.start, Math.min(t.xi, t.xf)) : span(Math.max(t.xi, t.xf), w.end);
    };

    const cds = () => { const t = translation(); return t ? span(t.xi, t.xf) : null; };

    const LABEL = {
        five_prime_utr: "5' UTR", three_prime_utr: "3' UTR", cds: 'CDS',
        transcript: 'the whole transcript', exon: 'exon', intron: 'intron',
        coordinates: 'that range'
    };

    // What this track can actually offer, so a caller can say "this transcript has no
    // annotated CDS" instead of returning an empty span and looking broken.
    const available = () => ({
        has_translation: !!translation(),
        five_prime_utr: !!utr(5),
        three_prime_utr: !!utr(3),
        cds: !!cds(),
        exons: exons().length,
        introns: introns().length,
        length: (whole() ? (whole().end - whole().start) : 0),
        strand: minus() ? '-' : '+'
    });

    const resolve = (spec) => {
        const s = spec || {};
        const what = ('' + (s.region || '')).trim().toLowerCase();
        const name = T.name || 'this track';
        let r = null;

        if (what === 'five_prime_utr' || what === 'three_prime_utr') {
            if (!translation()) {
                return { error: name + ' has no annotated coding region, so it has no 5′ or 3′ UTR' };
            }
            r = utr(what === 'five_prime_utr' ? 5 : 3);
            if (!r) return { error: name + ' has no ' + LABEL[what] + ': the coding region runs to the end of the transcript' };
        } else if (what === 'cds') {
            r = cds();
            if (!r) return { error: name + ' has no annotated coding region' };
        } else if (what === 'transcript') {
            r = whole();
            if (!r) return { error: name + ' has no extent to select' };
        } else if (what === 'exon' || what === 'intron') {
            const list = (what === 'exon') ? exons() : introns();
            if (!list.length) return { error: name + ' has no annotated ' + what + 's' };
            const i = num(s.index);
            if (i == null) return { error: 'which ' + what + '? ' + name + ' has ' + list.length };
            if (i < 1 || i > list.length) {
                return { error: name + ' has ' + list.length + ' ' + what + (list.length === 1 ? '' : 's')
                    + ', so there is no ' + what + ' ' + i };
            }
            const e = list[i - 1];
            r = (what === 'exon') ? span(e.xi, e.xf) : e;
            if (!r) return { error: 'that ' + what + ' has no extent' };
            return { start: r.start, end: r.end, label: what + ' ' + i + ' of ' + list.length };
        } else if (what === 'coordinates') {
            const a = num(s.start), b = num(s.end);
            if (a == null || b == null) return { error: 'that needs a start and an end' };
            r = span(a, b);
            if (!r) return { error: 'that range is empty' };
            const w = whole();
            if (w && (r.start < w.start || r.end > w.end)) {
                return { error: 'that range is outside ' + name + ', which runs ' + w.start + ' to ' + w.end };
            }
        } else {
            return { error: 'no such region: ' + (s.region || '(none)') };
        }
        return { start: r.start, end: r.end, label: LABEL[what] || what };
    };

    // ONE POSITION FROM WHAT SOMEONE TYPES: HGVS c. notation or a plain track coordinate.
    //   R.position('c.778')    -> { pos, label }  the base at coding position 778
    //   R.position('c.-12')    -> 12 bases before the A of the ATG, counted along the mRNA
    //   R.position('c.*30')    -> 30 bases after the stop codon
    //   R.position('c.778+5')  -> 5 bases into the intron after c.778 (or -5 before it)
    //   R.position('1520')     -> the track's own coordinate 1520
    // pos is the track coordinate of that base, which occupies [pos, pos+1). c. positions
    // are counted along the SPLICED transcript, in transcript order, so on a minus-strand
    // track c.1 sits at the HIGH end of the CDS and c.2 one base below it. This walks the
    // exons rather than calling track.codingToGenomic(), which sorts the track's annotation
    // list in place and rounds its coordinates as a side effect.
    const position = (text) => {
        const raw = ('' + (text == null ? '' : text)).trim().replace(/\s+/g, '');
        const name = T.name || 'this track';
        const w = whole();
        const inside = (p) => !w || (p >= w.start && p < w.end);
        const plain = raw.match(/^(?:pos(?:ition)?)?:?(\d+)$/i);
        if (plain) {
            const p = +plain[1];
            if (!inside(p)) return { error: p.toLocaleString() + ' is outside ' + name + ', which runs ' + w.start + ' to ' + w.end };
            return { pos: p, label: 'position ' + p.toLocaleString() };
        }
        const m = raw.match(/^c\.([-*]?)(\d+)([-+]\d+)?$/i);
        if (!m) return { error: '“' + text + '” is not a position: use c.778, c.-12, c.*30, c.778+5 or a plain number' };
        const c = cds();
        if (!c) return { error: name + ' has no annotated coding region, so it has no c. positions' };
        const n = +m[2];
        if (!m[1] && n < 1) return { error: 'c. positions start at c.1' };
        const mi = minus();
        // Exonic bases in transcript order.
        const tx = [];
        const byPos = exons().slice().sort((a, b) => (Math.min(a.xi, a.xf) - Math.min(b.xi, b.xf)));
        for (const e of byPos) {
            const s = span(e.xi, e.xf);
            if (s) for (let i = s.start; i < s.end; i++) tx.push(i);
        }
        if (!tx.length) return { error: name + ' has no annotated exons to count c. positions along' };
        if (mi) tx.reverse();
        const first = mi ? tx.findIndex((i) => i <= c.end - 1) : tx.findIndex((i) => i >= c.start);
        let last = -1;
        for (let k = tx.length - 1; k >= 0; k--) {
            if (mi ? tx[k] >= c.start : tx[k] < c.end) { last = k; break; }
        }
        if (first < 0 || last < first) return { error: name + '’s coding region does not lie on its exons' };
        const L = last - first + 1;
        let k;
        if (m[1] === '-') k = first - n;
        else if (m[1] === '*') k = last + n;
        else {
            if (n > L) return { error: name + '’s CDS is ' + L.toLocaleString() + ' nt, so there is no c.' + n + ' (past the stop codon is c.*' + (n - L) + ')' };
            k = first + n - 1;
        }
        if (k < 0 || k >= tx.length) {
            return { error: 'c.' + m[1] + n + ' runs off the ' + (k < 0 ? "5′" : "3′") + ' end of ' + name };
        }
        const off = m[3] ? +m[3] : 0;
        const p = tx[k] + (mi ? -off : off);
        if (!inside(p)) return { error: 'c.' + m[1] + n + (m[3] || '') + ' is outside ' + name };
        return { pos: p, label: 'c.' + m[1] + n + (m[3] || '') };
    };

    return {
        resolve: resolve, available: available, position: position,
        exons: exons, introns: introns, cds: cds, whole: whole,
        utr5: () => utr(5), utr3: () => utr(3), isMinus: minus,
        REGIONS: ['five_prime_utr', 'three_prime_utr', 'cds', 'transcript', 'exon', 'intron', 'coordinates']
    };
}
