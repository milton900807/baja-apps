async function (track, opts) {

    // WHAT SKIPPING EACH EXON WOULD DO TO THE PROTEIN, for every exon of a track.
    //
    //   const rows = await exec('baja/bio/orfs/exon-consequence-map.js', track, { onStep })
    //
    // The gene-level answers already on a track are averages over the whole protein: the
    // mRNA to protein transfer is one number for the gene, measured or predicted, and it
    // cannot say what losing exon 15 in particular does. This asks the question one exon at
    // a time, from the skip isoform itself.
    //
    // THE TRANSLATION IS NOT DONE HERE. Every row goes through
    // baja/bio/orfs/exon-removal-impact.js, which is what the exon menu's own "what would
    // removing this do" uses, so a row here and that menu cannot disagree about what a
    // frameshift, a PTC or an NMD call is. This module's whole job is to ask it for each
    // exon in turn, to say how often the skip actually happens, and to rank what comes
    // back.
    //
    // HOW OFTEN IT HAPPENS comes off the PSI layer when one has been run (the same
    // 1 - largest-skip-share the stability tag on each exon shows). Without it a row still
    // says what the skip WOULD do, which is the prediction, and says plainly that the rate
    // is unknown rather than implying a skip nobody has measured.
    //
    // Resolves [{ index, label, start, end, role, outcome, nmd, headline, lines,
    //             oldLength, newLength, aaDelta, psi, skip, severity, verdict }],
    // in exon order. A row with ok:false carries `reason` and nothing else to read.

    const T = track || {};
    const O = opts || {};
    const onStep = (typeof O.onStep === 'function') ? O.onStep : (() => { });

    const R = await exec('baja/bio/track-regions.js', T);
    const exons = R ? R.exons() : [];
    if (!exons.length) return [];

    // The skip share each exon already has on screen, from the PSI layer if one was run.
    // Same rule as the stability tag in baja/bio/track-layer.js, deliberately: two numbers
    // for the same thing, read off the same junctions, must agree.
    const skipShare = new Map();
    try {
        for (const L of (T.track_layers || [])) {
            if (!L || L.magnitudeMode !== 'psi' || !Array.isArray(L.junctions)) continue;
            const magMax = L.magMax || 1;
            for (const j of L.junctions) {
                if (!j || j.kind !== 'skip' || j.exon == null) continue;
                const f = Math.max(0, Math.min(1, (typeof j.mag === 'number' ? j.mag : 0) / magMax));
                const k = +j.exon;
                if (!(f <= (skipShare.get(k) || 0))) skipShare.set(k, f);
            }
        }
    } catch (e) { }
    const sawPsi = (T.track_layers || []).some((L) => L && L.magnitudeMode === 'psi');

    // WHAT IS AT STAKE, in one word, ordered worst first. The ranking is the point of a map
    // rather than a list: fifteen headlines are fifteen things to read, and the question
    // "which exon must not be lost" should be answerable by looking at the top of it.
    // Keyed on what exon-removal-impact.js actually returns. Its no-change outcome is
    // 'unchanged' and its lost-start one is 'start-lost'; guessing at those names is how a
    // map ends up calling a skip that abolishes the protein an ordinary one.
    const RANK = {
        'start-lost': 0,        // no protein from the annotated start at all
        nmd: 0,                 // skip destroys the message
        'nmd-maybe-escape': 1,
        nonstop: 1,
        escapes: 2,             // truncated protein actually made
        'as-original': 3,
        'in-frame': 3,
        unchanged: 4,
        'no-orf': 9
    };

    const rows = [];
    for (let i = 0; i < exons.length; i++) {
        const an = exons[i];
        const idx = i + 1;
        onStep(idx, exons.length);
        let r = null;
        try { r = await exec('baja/bio/orfs/exon-removal-impact.js', T, an); } catch (e) { r = null; }
        const lo = Math.min(+an.xi, +an.xf), hi = Math.max(+an.xi, +an.xf);
        const skip = skipShare.has(idx) ? skipShare.get(idx) : (sawPsi ? 0 : null);
        const base = {
            index: idx, label: 'exon ' + idx + ' of ' + exons.length,
            start: lo, end: hi,
            psi: (skip == null) ? null : (1 - skip),
            skip: skip
        };
        if (!r || !r.ok) {
            rows.push(Object.assign(base, { ok: false, reason: (r && r.reason) || 'could not be assessed',
                severity: 9, verdict: 'not assessed' }));
            continue;
        }
        const aaDelta = (r.newLength || 0) - (r.oldLength || 0);
        // The verdict is what the row is FOR: the headline says it in a sentence, and a
        // sentence per exon is not a map. These are the four things that can happen to the
        // protein, in the words the exon menu uses for them.
        const verdict = (r.outcome === 'unchanged') ? 'no change to the protein'
            : (r.outcome === 'start-lost') ? 'start codon lost: no protein'
            : (r.outcome === 'no-orf') ? 'no ORF to assess'
            : (r.outcome === 'nonstop') ? 'non-stop decay'
            : (r.outcome === 'in-frame') ? ('in-frame loss of ' + Math.abs(aaDelta) + ' aa')
            : (r.nmd === 'nmd') ? 'PTC, degraded (NMD)'
            : (r.nmd === 'nmd-maybe-escape') ? 'PTC, NMD may be incomplete'
            : ('PTC, escapes NMD: ' + (r.newLength || 0) + ' aa protein');
        // The OUTCOME decides, except where the outcome is a PTC and the NMD call is what
        // separates "no protein" from "a short one": only then does the nmd field rank it.
        const sev = (RANK[r.outcome] != null) ? RANK[r.outcome]
            : (RANK[r.nmd] != null ? RANK[r.nmd] : 5);
        rows.push(Object.assign(base, {
            ok: true, role: r.exonRole, position: r.position,
            outcome: r.outcome, nmd: r.nmd, headline: r.headline, lines: r.lines || [],
            oldLength: r.oldLength, newLength: r.newLength, aaDelta: aaDelta,
            codingNt: r.codingNt, exonLen: r.exonLen,
            severity: (sev == null ? 5 : sev), verdict: verdict
        }));
    }
    return rows;
}
