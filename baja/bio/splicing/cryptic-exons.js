function () {

    return new Promise(async (resolve, reject) => {

        const Annotation = await exec ('flexigraph/annotation')
        function generateCrypticExons(dataset, options = {}) {
            const {
                type = 'Phylon',

                xiAnchor = 0,

                toAbsolute = true,

                namePrefix = 'CE',
                nameFrom = 'index',

                annotationFrom = 'score',
                scoreDigits = 3,

                color = 'lightGray',
                y = 0,
                labelY = 0.5
            } = options;

            const results = Array.isArray(dataset?.results) ? dataset.results : [];
            const out = [];

            for (let i = 0; i < results.length; i++) {
                const r = results[i];

                const xi = toAbsolute ? (xiAnchor + (r.xi ?? 0)) : (r.xi ?? 0);
                const xf = toAbsolute ? (xiAnchor + (r.xf ?? 0)) : (r.xf ?? 0);

                let name = '';
                if (nameFrom === 'score') {
                    const s = (typeof r.score === 'number') ? r.score.toFixed(scoreDigits) : 'NA';
                    name = `${namePrefix}:${s}`;
                } else if (nameFrom === 'coords') {
                    name = `${namePrefix}:${xi}-${xf}`;
                } else {
                    name = `${namePrefix}:${i + 1}`;
                }

                let ann = '';
                if (typeof annotationFrom === 'function') {
                    ann = annotationFrom(r, i);
                } else if (annotationFrom === 'motifs') {
                    ann = `${r?.motifs?.acceptor ?? ''}/${r?.motifs?.donor ?? ''}`.replace(/^\/|\/$/g, '');
                } else if (annotationFrom === 'both') {
                    const s = (typeof r.score === 'number') ? r.score.toFixed(scoreDigits) : 'NA';
                    const m = `${r?.motifs?.acceptor ?? ''}/${r?.motifs?.donor ?? ''}`.replace(/^\/|\/$/g, '');
                    ann = m ? `${s} ${m}` : s;
                } else {
                    ann = (typeof r.score === 'number') ? r.score.toFixed(scoreDigits) : '';
                }

                const strand = r.strand ?? 1;

                const ce = new Annotation(type, name, xi, xf, strand, ann);
                ce.setIndex(i);
                ce.setColor(color);
                ce.y = 0;
                ce.labelY = labelY;

                ce.description = JSON.stringify({
                    chrom: r.chrom,

                    start_abs: r.start_abs,
                    end_abs: r.end_abs,

                    xiAnchor,
                    mapped_xi: xi,
                    mapped_xf: xf,
                    length: r.length,
                    score: r.score,
                    score_type: r.score_type,
                    motifs: r.motifs
                });

                out.push(ce);
            }

            return out;
        }

        resolve({
            generateCrypticExons
        })
    })

}
