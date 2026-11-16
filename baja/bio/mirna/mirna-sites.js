function (graph, track, range) {

    // MICRORNA SITES IN A SELECTED STRETCH.
    //   await exec('baja/bio/mirna/mirna-sites.js', graph, track, range);
    //
    // Scans the selection for canonical seed matches and marks each one on the track.
    //
    // WHAT THIS IS NOT. It finds SITES; it does not predict targets. Whether a site represses
    // anything depends on conservation, how far it sits from the ends of the 3' UTR, local AU
    // content, whether the message is even expressed where that miRNA is, and whether the
    // structure leaves it reachable. None of that is read here. A 6mer in particular is
    // marginal on its own and is reported because leaving it out would be a quiet judgement,
    // not because it is a finding.
    //
    // It also scans a SHORT CURATED LIST, the de-targeting set, not a catalogue: finding none
    // of them says nothing about the other ~2,600 human miRNAs. The result says so, because a
    // clean answer from a narrow scan reads exactly like a clean answer from a broad one.
    //
    // ON THE mRNA, NOT THE TRACK. A site is a feature of the message. The track holds the
    // genomic plus strand, so on a minus-strand gene the message is its reverse complement
    // and a scan of the stored strand would find sites that do not exist and miss the ones
    // that do. The sequence is turned into the message, scanned there, and the hits mapped
    // back for drawing.
    return (async () => {
        const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
        const result = (m) => { try { (graph.setResultMessage || graph.setMessage).call(graph, ' ' + m + ' '); } catch (e) { } };
        if (!track) { say('No track selected.'); return 0; }

        const lo = range ? Math.round(Math.min(+range.start, +range.end)) : Math.round(+track.xi);
        const hi = range ? Math.round(Math.max(+range.start, +range.end)) : Math.round(+track.xf);
        let plus = '';
        try { plus = ('' + (track.getSequenceRange(lo, hi) || '')).toUpperCase().replace(/U/g, 'T'); } catch (e) { plus = ''; }
        plus = plus.replace(/[^ACGTN]/g, '');
        if (plus.length < 7) {
            say('Select at least 7 nt: the shortest canonical site is a 6mer plus one base.');
            return 0;
        }

        const RC = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
        const minus = (+(track.strand || 0) < 0);
        const L = plus.length;
        const mrna = minus ? plus.split('').reverse().map((b) => RC[b] || 'N').join('') : plus;
        // mRNA [s,e) -> track [a,b). On a minus-strand gene the message runs the other way, so
        // the END of a site is the lower track coordinate.
        const back = (s, e) => minus ? [lo + (L - e), lo + (L - s)] : [lo + s, lo + e];

        const M = await exec('baja/bio/mirna/mirna-seeds.js');
        const hits = M.scan(mrna);

        const where = (track.name || 'track') + ' · ' + L.toLocaleString() + ' nt'
            + (minus ? ', minus strand (scanned on the message)' : '');
        if (!hits.length) {
            result('No canonical site for any of the ' + M.MIRNA.length + ' miRNAs in this set, over '
                + where + '. That is a narrow scan: the set is the de-targeting list, not a catalogue, '
                + 'so this says nothing about the rest.');
            return 0;
        }

        try { graph.pushOntoHistory(); } catch (e) { }
        const COLOR = { '8mer-1a': '#b45309', '7mer-m8': '#c2410c', '7mer-A1': '#a16207', '6mer': '#6b7280' };
        let drawn = 0;
        for (const h of hits) {
            const [a, b] = back(h.start, h.end);
            try {
                const an = new Annotation('miRNA site', h.name + '  ' + h.cls, a, b, track.strand);
                an.color = COLOR[h.cls] || '#6b7280';
                an.description = h.name + ' ' + h.cls + ' site (' + h.match + ')'
                    + (h.tissue ? ('. Active in ' + h.tissue) : '')
                    + (h.use ? ('. ' + h.use) : '')
                    + '. A site, not a prediction: conservation, position in the UTR, AU context and '
                    + 'expression are not read here.'
                    + (h.verify ? ' Seed derived from the mature sequence, not read from miRBase.' : '');
                an.comment = an.description;
                track.add(an);
                drawn++;
            } catch (e) { }
        }
        try { if (graph.wake) graph.wake(); } catch (e) { }

        // By miRNA, strongest site first: which miRNA has a claim here is the question, and a
        // list in positional order answers a different one.
        const byMi = new Map();
        for (const h of hits) {
            if (!byMi.has(h.name)) byMi.set(h.name, []);
            byMi.get(h.name).push(h);
        }
        const rows = Array.from(byMi.entries())
            .map(([name, hs]) => ({
                name: name, hs: hs,
                best: hs.reduce((a, b) => (b.rank > a.rank ? b : a)),
                strong: hs.filter((x) => x.rank >= 3).length
            }))
            .sort((a, b) => (b.best.rank - a.best.rank) || (b.hs.length - a.hs.length));

        const nStrong = hits.filter((h) => h.rank >= 3).length;
        result(drawn + ' site' + (drawn === 1 ? '' : 's') + ' marked on ' + where + ': '
            + rows.map((r) => r.name + ' ' + r.best.cls + (r.hs.length > 1 ? (' ×' + r.hs.length) : '')).join(', ')
            + '. ' + (nStrong ? (nStrong + ' of them 7mer-m8 or better. ') : 'None stronger than a 7mer-A1. ')
            + 'Sites, not predictions, and from the de-targeting set only.');

        const menu = [
            { label: 'microRNA sites in ' + L.toLocaleString() + ' nt', header: true },
            { label: hits.length + ' site' + (hits.length === 1 ? '' : 's') + ', ' + rows.length + ' miRNA'
                + (rows.length === 1 ? '' : 's') + ' of ' + M.MIRNA.length + ' scanned', header: true }
        ];
        for (const r of rows) {
            menu.push({
                label: r.name + '   ' + r.best.cls + (r.hs.length > 1 ? ('  ×' + r.hs.length) : '')
                    + (r.tissue ? '' : '') + '  ·  ' + (r.hs[0].tissue || ''),
                move: () => { },
                click: () => {
                    try { graph.showSideMenu(null); } catch (e) { }
                    const [a, b] = back(r.best.start, r.best.end);
                    try {
                        const ax = track.grid || track.tgraph;
                        if (ax) graph.animateTo(ax.X(a - 120), ax.X(b + 120), ax.Y(-1.2), ax.Y(1.2));
                    } catch (e) { }
                    result(r.name + ': ' + r.hs.map((h) => h.cls).join(', ')
                        + '. ' + (r.hs[0].use || '') + ' Seed derived from the mature sequence, not read from miRBase.');
                }
            });
        }
        menu.push({ label: 'A site is not a target: conservation, UTR position, AU context and', header: true });
        menu.push({ label: 'expression decide whether any of these represses anything.', header: true });
        if (graph.openMenuAtPointer) graph.openMenuAtPointer(menu, 'microRNA');
        else graph.showSideMenu(menu);
        return drawn;
    })();
}
