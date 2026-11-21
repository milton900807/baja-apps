function (track) {

    // HOW STABLY EACH EXON SPLICES, FROM WHATEVER THE PSI LAYER ACTUALLY HAS.
    //   const rows = exec('baja/bio/splicing/exon-stability.js', track);
    //   // [{ exon, lo, hi, psi, word, measured, untrusted, untrustedWhy, from }]
    //
    // The scored rows the PSI run writes onto its layer (layer.exonStability) are the
    // answer whenever they are there, and this hands them straight back: they carry the
    // conservation and site weighting, the variant effects and the measured overrides, and
    // a second opinion computed here would only drift from the number on the canvas.
    //
    // THEY ARE NOT ALWAYS THERE. Those rows are built by numbering the arcs against the
    // annotated exons -- each arc endpoint has to land within three bases of an exon edge,
    // on one of the two numberings -- and on a pair of genomic tracks that fit can fail
    // outright. The run has then happened, the arcs are on the track, and the report says
    // "PSI ran but matched no arcs to the annotated exons", which is true and useless:
    // the arcs are still sitting over the exons where anyone can see them.
    //
    // So where the scored rows are missing, the same question is answered from the arcs by
    // POSITION, which needs no numbering to agree about anything: an exon is skipped by
    // the arcs that jump clean over it, and PSI is one minus the largest such share. It is
    // the weaker answer -- no weighting, no variant effects -- and it says so in `from`,
    // which is what the report prints beside it.

    const t = track || {};
    const layers = (t.track_layers || []).filter((x) => x && x.magnitudeMode === 'psi');
    if (!layers.length) return [];

    // The most recent: a track re-run after an edit holds both, and the answer is the last.
    const scored = layers.filter((x) => Array.isArray(x.exonStability) && x.exonStability.length).pop();
    if (scored) {
        return scored.exonStability.map((r) => Object.assign({}, r, { from: 'scored' }));
    }

    const L = layers[layers.length - 1];
    const js = (L.junctions || []).filter(Boolean);
    if (!js.length) return [];
    const magMax = (+L.magMax > 0) ? +L.magMax : 1;

    const exons = (t.annotations || [])
        .filter((a) => a && ('' + a.type).toLowerCase() === 'exon'
            && isFinite(+a.xi) && isFinite(+a.xf))
        .map((a) => ({ a: a, lo: Math.min(+a.xi, +a.xf), hi: Math.max(+a.xi, +a.xf) }))
        .sort((p, q) => p.lo - q.lo);
    if (!exons.length) return [];

    // A measurement outranks anything computed, as it does on the canvas.
    const measured = (L.measuredPsi || []).filter(Boolean);
    const measuredAt = (lo, hi) => {
        for (const m of measured) {
            const a2 = Math.min(+m.xi, +m.xf), b2 = Math.max(+m.xi, +m.xf);
            if (isFinite(a2) && isFinite(b2) && a2 <= hi && b2 >= lo) return m;
        }
        return null;
    };

    const EDGE = 6;           // how near an arc end has to be to count as landing on an edge
    const rows = [];
    for (let i = 0; i < exons.length; i++) {
        const e = exons[i];
        let skip = 0, touched = false;
        for (const j of js) {
            const d = Math.min(+j.d, +j.a), a = Math.max(+j.d, +j.a);
            if (!isFinite(d) || !isFinite(a)) continue;
            const f = Math.max(0, Math.min(1, (typeof j.mag === 'number' ? j.mag : 0) / magMax));
            // JUMPED CLEAN OVER: an arc that starts before this exon and lands after it
            // leaves it out of that transcript, whatever the arc is labelled.
            if (d < e.lo - EDGE && a > e.hi + EDGE) { if (f > skip) skip = f; touched = true; continue; }
            // Landing on one of its edges is this exon being spliced IN.
            if (Math.abs(d - e.lo) <= EDGE || Math.abs(d - e.hi) <= EDGE
                || Math.abs(a - e.lo) <= EDGE || Math.abs(a - e.hi) <= EDGE) touched = true;
        }
        // AN EXON NO ARC GOES NEAR IS NOT A CONSTITUTIVE EXON, it is an exon nothing was
        // said about. Reporting it as 100% would be inventing the best possible answer out
        // of an absence of evidence, on the exons least likely to have been scored.
        //
        // IT STILL GETS A ROW. Every exon is listed, in order, so a reader can see that the
        // run covered the whole transcript and which exons it had nothing to say about.
        // Dropping them silently makes the gaps look like exons that do not exist.
        const mm = measuredAt(e.lo, e.hi);
        if (!touched && !mm) {
            rows.push({ exon: i + 1, lo: e.lo, hi: e.hi, psi: null, score: null,
                word: 'no arcs over it', measured: null, unknown: true, from: 'arcs' });
            continue;
        }
        const psi = (mm && isFinite(+mm.psi)) ? +mm.psi : (1 - skip);
        const score = 1 - Math.abs(2 * psi - 1);
        rows.push({
            exon: i + 1, lo: e.lo, hi: e.hi, psi: psi, score: score,
            word: (score <= 0.15) ? (psi >= 0.5 ? 'constitutive' : 'rarely in')
                : (score <= 0.45) ? 'variable' : 'unstable',
            measured: mm || null,
            from: mm ? 'measured' : 'arcs'
        });
    }
    return rows;
}
