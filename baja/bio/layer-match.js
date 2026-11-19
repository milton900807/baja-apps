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

        // A FILLED TRACE WITH PEAKS. Counting points is not enough: a rectangle drawn as a
        // polygon has four, and a baseline drawn across a region has many, all at the same
        // height. What makes it coverage is that the height keeps changing.
        const looksLikeCoverage = (l) => {
            if (!l) return false;
            const pts = tracePoints(l);
            if (pts.length < MIN_POINTS) return false;
            const levels = {};
            let n = 0;
            for (const p of pts) {
                if (!p || !isFinite(+p.y)) continue;
                const k = '' + (Math.round((+p.y) * 1000) / 1000);
                if (!levels[k]) { levels[k] = 1; n++; }
                if (n >= MIN_LEVELS) return true;
            }
            return false;
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
        const anyTrace = (layers) => (layers || []).filter((l) => l && looksLikeCoverage(l));

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
            return out;
        };

        const nameOf = (l) => '' + ((l && l.name) || '(unnamed)');
        const describe = (l) => {
            const k = '' + ((l && l.data_type) || '');
            const n = tracePoints(l).length;
            return nameOf(l) + (k ? (' [' + k + ']') : '')
                + (looksLikeCoverage(l) ? (' [' + n + ' points, peaks]') : '');
        };

        return { match: match, looksLikeCoverage: looksLikeCoverage, nameOf: nameOf,
                 describe: describe, anyTrace: anyTrace, tracePoints: tracePoints, KINDS: KINDS };
    })();
}
