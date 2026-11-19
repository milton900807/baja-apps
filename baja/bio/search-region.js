function (graph, query, target, opts) {

    // ONE REGION, SEARCHED AGAINST A WHOLE TRACK, HITS RANKED.
    //   exec('baja/bio/search-region.js', graph, {track, start, end, label}, targetTrack, {})
    //
    // "compare exon 16 of one transcript with any other part of another and rank the
    // results" is not a pairwise comparison, and the editor was right to say so: a pairwise
    // alignment answers "how similar are these two", and this asks "where in that one does
    // this turn up, and how good is each place". Different question, different operation.
    //
    // THE SEARCH IS NOT DONE HERE. py/bio/search-region-in-track.py does it with Biopython,
    // scored like blastn and masking each hit before looking for the next, so the second-best
    // match is a real second hit rather than the same one found again.

    return new Promise(async (resolve) => {
        try {
            const o = opts || {};
            const qt = query && query.track;
            if (!qt || !target) { resolve({ error: 'a region and a track to search are needed' }); return; }
            if (qt === target) {
                resolve({ error: 'the region and the track to search are the same track' });
                return;
            }

            const seqIn = (t, a, b) => {
                try {
                    if (!t.getSequenceRange) return '';
                    return ('' + (t.getSequenceRange(a, b) || '')).toUpperCase().replace(/[^ACGTUN]/g, '');
                } catch (e) { return ''; }
            };

            const qseq = seqIn(qt, query.start, query.end);
            if (!qseq || qseq.length < 12) {
                resolve({ error: (query.label || 'that region') + ' has no sequence to search with' });
                return;
            }
            // The whole of the other track, with its own left edge carried along so the hits
            // come back in ITS coordinates and not as offsets into a string.
            const lo = Math.min(target.xi, target.xf), hi = Math.max(target.xi, target.xf);
            const tseq = seqIn(target, lo, hi);
            if (!tseq || tseq.length < 12) {
                resolve({ error: (target.name || 'that track') + ' has no sequence to search' });
                return;
            }

            let res = null;
            try {
                res = await exec('py/bio/search-region-in-track.py',
                    { name: (query.label || 'the region'), seq: qseq },
                    { name: ('' + (target.name || 'the track')), seq: tseq, offset: lo },
                    { max_hits: (o.max_hits || 8), strands: (o.strands || 'both') });
            } catch (e) { res = null; }
            if (!res) { resolve({ error: 'the search could not be run on the server' }); return; }
            if (res.status === 'ERROR') { resolve({ error: ('' + (res.error || 'the search failed')) }); return; }

            const hits = res.hits || [];
            const pct = (x) => (Math.round((+x || 0) * 1000) / 10).toFixed(1) + '%';
            const rows = [];
            if (!hits.length) {
                rows.push(['no hits', 'Nothing in ' + (target.name || 'that track') + ' matches '
                    + (query.label || 'that region') + ' above the noise floor (score '
                    + Math.round(res.floor || 0) + '). Two sequences of this length reach that '
                    + 'much by chance, so anything below it would be a coincidence reported as '
                    + 'a finding.']);
            }
            for (const h of hits) {
                rows.push([
                    '#' + h.rank + ' · ' + h.start.toLocaleString() + '–' + h.end.toLocaleString()
                    + ' (' + h.strand + ') · ' + pct(h.identity),
                    'score ' + Math.round(h.score) + ', ' + pct(h.identity) + ' identical over '
                    + (h.length || 0).toLocaleString() + ' aligned bases'
                    + (h.gaps ? (' (' + h.gaps + ' in gaps)') : '') + '. '
                    // WHICH PART OF THE QUERY MATCHED. A 40-base hit to a 170-base exon is a
                    // different claim from a 170-base one, and the score alone hides it.
                    + 'It covers ' + pct(h.query_coverage) + ' of ' + (query.label || 'the region')
                    + ' (bases ' + h.query_start + '–' + h.query_end + ' of it)'
                    + (h.strand === '-' ? ', on the opposite strand' : '') + '.'
                ]);
            }
            rows.push(['searched', (query.label || 'the region') + ' of '
                + (qt.name || 'a track') + ', ' + (res.query || {}).length + ' bases, against all '
                + ((res.target || {}).length || 0).toLocaleString() + ' bases of '
                + (target.name || 'the other track') + '.']);
            rows.push(['aligner', '' + (res.engine || 'biopython')
                + '. Each hit is masked out before the next is looked for, so these are '
                + 'different places and not one place found repeatedly.']);

            const help = {
                title: (query.label || 'Region') + ' in ' + (target.name || 'the track') + ': '
                    + (hits.length ? (hits.length + ' hit' + (hits.length === 1 ? '' : 's') + ', best first') : 'no hits'),
                rows: rows,
                note: 'Ranked by alignment score. Read the identity together with how much of '
                    + 'the query each hit covers: a short, perfect match scores less than a long, '
                    + 'imperfect one and means something quite different.'
            };
            try { await exec('baja/bio/decor-help.js', { decor: { help: help } }, graph); }
            catch (e) { try { graph.setResultMessage(rows.map((r) => r[1]).join(' ')); } catch (e2) { } }
            try { window.__bajaRegionSearch = res; } catch (e) { }

            try {
                graph.setMessage((query.label || 'The region') + ' in ' + (target.name || 'the track')
                    + ': ' + (hits.length ? (hits.length + ' hit' + (hits.length === 1 ? '' : 's')
                        + ', best ' + pct(hits[0].identity) + ' identical at '
                        + hits[0].start.toLocaleString()) : 'nothing above the noise floor'));
            } catch (e) { }

            resolve({ hits: hits, query: res.query, target: res.target, floor: res.floor });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}
