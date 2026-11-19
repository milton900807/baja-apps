function () {

    // WHAT "THE RNA SEQ LAYERS" MEANS, in one place.
    //   const LM = await exec('baja/bio/layer-match.js');
    //   LM.match(track.track_layers, 'rna seq')   ->  [{ layer, why }]
    //
    // Three things ask this question -- the removal, the card that previews the removal, and
    // whatever asks next -- and they have to give the same answer, or the card names three
    // layers and four go.
    //
    // A LAYER IS NOT ALWAYS LABELLED WITH WHAT IT IS. A kind (RNASEQ, SLIM, CDD) is the
    // reliable way to ask, and a name is how a user points at one they can see. Neither finds
    // an RNA-seq coverage trace loaded from a bigwig: it is built with addPolygonPoint and
    // handed to the track with no data_type at all, under whatever the file was called
    // (GRCh38illuminabrain1). Asking for "the rna seq layers" found nothing and said so,
    // while the peaks were plainly on the screen.
    //
    // So the last resort is WHAT THE LAYER IS DRAWN AS: a filled trace of many points at
    // varying heights is coverage, whatever it is called. That is an inference and is marked
    // as one -- why: 'shape' -- because the caller must be able to ask before acting on a
    // guess, which it could not do if a guess arrived looking like a name match.

    return (async () => {

        // The kinds a request names in words, against the data_type a layer carries.
        const KINDS = [
            [/\b(rna.?seq|rnaseq|expression|coverage|reads|bigwig|peaks?)\b/, ['RNASEQ']],
            [/\b(motifs?|slims?|elm|linear motifs?)\b/, ['SLIM']],
            [/\b(domains?|cdd|sites?)\b/, ['CDD']],
            [/\b(similarity|similar regions?|homology|conservation)\b/, ['SEQSIM', 'PROTSIM']],
            [/\b(splicing|splice|sashimi|junctions?)\b/, ['SPLICING']],
            [/\b(bed|intervals?)\b/, ['BED']],
            [/\b(patents?)\b/, ['PATENTS']],
            [/\b(secretion)\b/, ['SECRETION', 'SECRETION:POLY']],
            [/\b(ip|clip|binding)\b/, ['IP', 'IPEXONSPACE']]
        ];

        // Words that say the request is about coverage data, whatever the layer calls itself.
        const COVERAGE_WORDS = /\b(rna.?seq|rnaseq|expression|coverage|reads|bigwig|peaks?|tracks? of reads)\b/;

        const MIN_POINTS = 4;        // fewer than this is a shape, not a trace
        const MIN_LEVELS = 3;        // a flat or two-step outline is a box, not peaks

        // A trace's points live in polygonpts (addPolygonPoint) or in pts (addPoint),
        // depending on which loader built it. Looking in only one of them is how a layer
        // with peaks plainly on the screen comes back as "nothing there matches".
        const tracePoints = (l) => {
            if (!l) return [];
            if (Array.isArray(l.polygonpts) && l.polygonpts.length) return l.polygonpts;
            if (Array.isArray(l.pts) && l.pts.length) return l.pts;
            return [];
        };

        // FILLED POLYGONS FIRST. A TrackLayer fills by default (polygon_type = 'fill'), and
        // a layer that opts out of it is drawn as a stroked line: the rna-protein plateau
        // does exactly that for its measured arm. Fill is what the eye reads as a coverage
        // track, so it is the first thing asked.
        const isFilled = (l) => !!l && ('' + (l.polygon_type == null ? 'fill' : l.polygon_type)) === 'fill';

        const levelsOf = (pts) => {
            const seen = {};
            let n = 0;
            for (const p of pts) {
                if (!p || !isFinite(+p.y)) continue;
                const k = '' + (Math.round((+p.y) * 1000) / 1000);
                if (!seen[k]) { seen[k] = 1; n++; }
            }
            return n;
        };

        // A FILLED TRACE WITH PEAKS. Counting points is not enough: a rectangle drawn as a
        // polygon has four, and a baseline drawn across a region has many, all at the same
        // height. What makes it coverage is that the height keeps changing.
        const looksLikeCoverage = (l) => {
            if (!l || !isFilled(l)) return false;
            const pts = tracePoints(l);
            if (pts.length < MIN_POINTS) return false;
            return levelsOf(pts) >= MIN_LEVELS;
        };

        // THEN WHAT ELSE SAYS RNA-SEQ. Fill and peaks say "a trace"; they do not say what
        // the trace is of. These are the other properties that point at read coverage, and
        // they are reported rather than used as a gate: the user is the one who knows, and
        // a list of reasons is what lets them decide in one look.
        const READY_NAME = /(rna.?seq|bigwig|\.bw\b|\bwig\b|encff|srr\d|srx\d|illumina|nanopore|pacbio|gtex|encode|brain|liver|muscle|tissue|coverage|reads|expression|grch\d|hg\d\d)/i;
        const evidence = (l) => {
            const out = [];
            const pts = tracePoints(l);
            if (isFilled(l)) out.push('filled');
            if (pts.length) out.push(pts.length + ' points');
            if (levelsOf(pts) >= MIN_LEVELS) out.push('peaks');
            const dt = ('' + ((l && l.data_type) || '')).toUpperCase();
            if (dt.indexOf('RNASEQ') === 0) out.push('kind says RNASeq');
            else if (dt) out.push('kind ' + (l.data_type));
            else out.push('no kind set');
            if (READY_NAME.test('' + ((l && l.name) || ''))) out.push('name reads like a read file');
            if (!((l && l.intervals) || []).length) out.push('no intervals');
            // A coverage trace is scaled against its own maximum, so every point sits within
            // one unit of the baseline, on one side of it.
            let lo = null, hi = null;
            for (const p of pts) {
                if (!p || !isFinite(+p.y)) continue;
                lo = (lo == null) ? +p.y : Math.min(lo, +p.y);
                hi = (hi == null) ? +p.y : Math.max(hi, +p.y);
            }
            if (lo != null && Math.abs(hi - lo) <= 1.0001 && (lo >= -0.0001 || hi <= 0.0001)) {
                out.push('normalised to its own maximum');
            }
            return out;
        };

        // How much the other properties point at RNA-seq, for ordering the choices: the
        // likeliest first, so the row the user wants is the one under the pointer.
        const rnaseqScore = (l) => {
            let n = 0;
            const dt = ('' + ((l && l.data_type) || '')).toUpperCase();
            if (dt.indexOf('RNASEQ') === 0) n += 4;
            else if (dt) n -= 2;                       // it says it is something else
            if (READY_NAME.test('' + ((l && l.name) || ''))) n += 3;
            if (!((l && l.intervals) || []).length) n += 1;
            if (tracePoints(l).length >= 50) n += 1;
            return n;
        };

        // A layer that says what it is keeps its own kind: a secretion polygon and a binding
        // profile are drawn as traces too, and "remove the rna seq layers" does not mean them.
        const unlabelledOrCoverage = (l) => {
            const dt = ('' + ((l && l.data_type) || '')).toUpperCase().trim();
            return !dt || dt.indexOf('RNASEQ') === 0;
        };

        const flat = (x) => ('' + x).toLowerCase().replace(/[^a-z0-9]+/g, '');

        // -> [{ layer, why }] where why is 'all' | 'kind' | 'name' | 'shape'. The order is the
        // order of certainty: a kind is what the layer says it is, a name is what the user
        // pointed at, a shape is a guess from how it is drawn.
        // EVERY LAYER THAT IS DRAWN AS A TRACE, whatever it calls itself. This is the last
        // thing tried, and only when the request asked for coverage and nothing else answered
        // at all: at that point "there is nothing here" is plainly wrong -- the peaks are on
        // the screen -- and the useful move is to show what IS drawn as a trace and let the
        // user say which of them is the RNA-seq they meant.
        const anyTrace = (layers) => (layers || []).filter((l) => l && looksLikeCoverage(l))
            .sort((a, b) => rnaseqScore(b) - rnaseqScore(a));

        const match = (layers, want) => {
            const list = (layers || []).filter(Boolean);
            const w = ('' + (want || '')).trim().toLowerCase();
            // "REMOVE THE LAYERS" AND "REMOVE THE TRACKLAYERS" ARE THE SAME REQUEST. A
            // layer on a track IS a TrackLayer, so a request that names the class rather
            // than the thing on screen means all of them, not a kind called "tracklayer"
            // that would match nothing and report that nothing was found.
            const EVERYTHING = /^(all|every|everything|all +(the +)?(track ?)?layers?|(the +)?(track ?)?layers?)$/;
            if (!w || EVERYTHING.test(w)) {
                return list.map((l) => ({ layer: l, why: 'all' }));
            }

            let kinds = [];
            for (const [re, ks] of KINDS) { if (re.test(w)) kinds = kinds.concat(ks); }
            const wantsCoverage = COVERAGE_WORDS.test(w);

            const out = [];
            for (const l of list) {
                const dt = ('' + ((l && l.data_type) || '')).toUpperCase();
                let why = '';
                for (const k of kinds) { if (dt === k || dt.indexOf(k) === 0) { why = 'kind'; break; } }
                if (!why) {
                    const nm = ('' + ((l && l.name) || '')).toLowerCase();
                    // With and without punctuation, so "rna seq" finds rna_seq_brain and
                    // "rnaseq" finds one called RNA-seq.
                    if (nm && (nm.indexOf(w) >= 0 || flat(nm).indexOf(flat(w)) >= 0)) why = 'name';
                }
                if (!why && wantsCoverage && unlabelledOrCoverage(l) && looksLikeCoverage(l)) why = 'shape';
                if (why) out.push({ layer: l, why: why });
            }
            if (!out.length && wantsCoverage) {
                return anyTrace(list).map((l) => ({ layer: l, why: 'polygon' }));
            }
            // A guess is ordered by how much the rest of the layer points at RNA-seq, so the
            // row the user wants is the one under the pointer. What matched by kind or by
            // name is not a guess and keeps the order it is in on the track.
            const sure = out.filter((h) => h.why === 'kind' || h.why === 'name');
            const guess = out.filter((h) => h.why === 'shape')
                .sort((a, b) => rnaseqScore(b.layer) - rnaseqScore(a.layer));
            return sure.concat(guess);
        };

        const nameOf = (l) => '' + ((l && l.name) || '(unnamed)');
        const describe = (l) => {
            const k = '' + ((l && l.data_type) || '');
            return nameOf(l) + (k ? (' [' + k + ']') : '')
                + (looksLikeCoverage(l) ? (' [' + evidence(l).join(', ') + ']') : '');
        };

        return { match: match, looksLikeCoverage: looksLikeCoverage, nameOf: nameOf,
                 describe: describe, anyTrace: anyTrace, tracePoints: tracePoints,
                 evidence: evidence, isFilled: isFilled, rnaseqScore: rnaseqScore, KINDS: KINDS };
    })();
}
