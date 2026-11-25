// AN EMPTY getExons() IS NOT THE SAME AS NO getExons().
//
//     node tools/test/exons-of-track.js
//
// The shape that keeps getting written is `t.getExons ? t.getExons() : t.annotations`,
// which branches on whether the METHOD EXISTS. On a track where it exists and returns an
// empty array the annotations are never reached, the gene reads as having no exons at
// all, and whatever was being computed returns nothing with no account of why. It has
// now cost two features and an afternoon in another session, in modules copied from each
// other, which is what a three-line idiom repeated twenty times buys.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

(async () => {
    const exonsOfTrack = await new AF('exec', 'args', core + '\nreturn exonsOfTrack;')(null, {});
    const ann = [{ type: 'Exon', xi: 10, xf: 90 }, { type: 'Exon', xi: 200, xf: 260 }];

    // THE CASE THAT BROKE: the method is there, and gives nothing.
    ok(exonsOfTrack({ getExons: () => [], annotations: ann }).length === 2,
       'an empty getExons() falls back to the annotations');
    ok(exonsOfTrack({ getExons: () => null, annotations: ann }).length === 2, 'and a null one');
    ok(exonsOfTrack({ getExons: () => { throw new Error('not loaded'); }, annotations: ann }).length === 2,
       'and one that throws, rather than taking the run down with it');

    // What it must not do.
    ok(exonsOfTrack({ getExons: () => [{ xi: 5, xf: 9 }], annotations: ann }).length === 1,
       'a getExons() that answers is the answer: the annotations are not merged in');
    ok(exonsOfTrack({ annotations: ann }).length === 2, 'no method at all still reads the annotations');
    ok(exonsOfTrack({ annotations: [{ type: 'CDS', xi: 1, xf: 2 }] }).length === 0,
       'and only the exons among them');
    ok(exonsOfTrack({ annotations: [{ type: 'exon', xi: 1, xf: 2 }] }).length === 1, 'whatever their case');
    ok(exonsOfTrack({}).length === 0 && exonsOfTrack(null).length === 0,
       'a track with neither gives an empty list, not a throw');

    // ---- and the copies are gone ---------------------------------------------------------
    // Each one of these was a place where a track with an empty getExons() silently
    // produced nothing: no introns to scan, no frame to read, no exon to name in a prompt.
    const files = [
        'baja/bio/splicing/cryptic-exon-candidates.js', 'baja/bio/splicing/ag-scan.js',
        'baja/bio/orfs/exon-removal-impact.js', 'baja/bio/coords/cds-coords.js',
        'baja/bio/rna/rna-dynamic-range.js', 'baja/data/prompt-action.js',
        'baja/bio/splicing/splicing-profile.js', 'baja/bio/splicing/cis-attribution.js',
        'baja/bio/splicing/strand-orientation.js', 'baja/bio/track-strand.js',
        'baja/bio/orfs/make-mrna.js', 'baja/data/alt-contig-map.js',
        'baja/data/load-variants.js', 'baja/manchester/menu/variant-impact.js',
        'baja/data/bed-hits.js', 'baja/data/ip.js', 'baja/data/patents.js',
        'baja/io/aso-report-pdf.js', 'baja/manchester/menu/compare-tracks.js',
        'baja/manchester/menu/comparative-tools.js', 'baja/bio/track-coords.js'
    ];
    for (const f of files) {
        const src = fs.readFileSync(f, 'utf8');
        const live = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
        ok(!/\.getExons \? /.test(live), f + ' does not branch on the method existing');
        ok(/exonsOfTrack\(/.test(live), f + ' asks the shared one');
    }
    // The track class itself still implements getExons; it is the thing being called.
    ok(/getExons\(\)/.test(fs.readFileSync('baja/bio/track.js', 'utf8')),
       'the track class still has the method this is about');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
