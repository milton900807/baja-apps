// WHAT IS KNOWN TO BE IN THIS STRETCH, DRAWN ONLY WHERE IT CHECKS OUT.
//
//     node tools/test/knowledge-layer.js          (needs jsdom)
//
// Four steps end to end: write down what the selection contains, ask the literature, find
// each claim's published sequence in the selection, draw what survives. The test holds the
// model's answer so it can contain a true claim, a hallucinated one, and one about the
// wrong part of the gene, which is what a real answer looks like.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let asked = null, reply = null;
const load = async (p, ...a) => {
    if (/region-knowledge\.py$/.test('' + p)) { asked = a; return reply; }
    if (/working\.js$/.test('' + p)) return { step() { }, done() { }, fail(m) { failed.push('' + m); } };
    const src = fs.readFileSync(p, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };
let failed = [];

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// A gene with two exons and an intron between them; the "cryptic exon" sits in the intron.
const FILLER = 'ACGTTGCAATCGGATCAGGCATTAGCCATG';
const CRYPTIC = 'GTAAGTCCTTAGGACATTTCGGACCTAAGGTTCAGCATACCGT';
const INTRON_SEQ = FILLER.repeat(30) + CRYPTIC + FILLER.repeat(30);
const SEQ = 'ATG' + FILLER.repeat(10) + INTRON_SEQ + FILLER.repeat(10) + 'TAA';
const EX1 = [0, 302], INTRON = [303, 303 + INTRON_SEQ.length - 1];
const EX2 = [INTRON[1] + 1, SEQ.length - 1];
const CRYPTIC_AT = 303 + FILLER.length * 30;

const mkTrack = () => ({
    name: 'STMN2', chr: '8', chrstart: 79611117, xi: 0, xf: SEQ.length - 1, strand: 1,
    species: 'human', assembly: 'GRCh38', sequence: SEQ, track_layers: [], added: [],
    annotations: [{ type: 'Exon', index: 1, xi: EX1[0], xf: EX1[1] },
                  { type: 'Exon', index: 2, xi: EX2[0], xf: EX2[1] }],
    getExons() { return this.annotations.filter((a) => a.type === 'Exon'); },
    getSequenceRange(a, b) { return SEQ.slice(Math.max(0, a), Math.max(0, b) + 1); },
    addLayer(L) { this.track_layers.push(L); }
});
const mkGraph = () => ({ said: [], results: [], setMessage(m) { this.said.push('' + m); },
    setResultMessage(m) { this.results.push('' + m); }, wake() { }, rescale() { } });
const run = (g, t, reg, o) => { failed = []; return load('baja/bio/knowledge/region-knowledge.js', g, t, reg, o || {}); };

(async () => {
    // ---- what the selection says about itself ------------------------------------------
    {
        const t = mkTrack();
        const J = await load('baja/bio/knowledge/selection-json.js', t, { xi: INTRON[0], xf: INTRON[1] }, {});
        ok(J.gene === 'STMN2' && J.genomic.chr === '8', 'the selection knows what it is part of');
        ok(J.genomic.start === 79611117 + INTRON[0],
           'with genomic coordinates, not track pixels: ' + J.genomic.start);
        // A SELECTION OF AN INTRON WOULD OTHERWISE DESCRIBE ITSELF AS EMPTY: an intron is a
        // gap between annotations, so nothing in the annotation list mentions it.
        ok(J.introns.length === 1 && J.introns[0].number === 1 && J.introns[0].covered === 'all',
           'and names the intron it is, which is not an annotation: ' + JSON.stringify(J.introns));
        ok(J.annotations.length === 0,
           'an intron selection overlaps no annotation at all, which is exactly why the intron '
           + 'list above has to exist: ' + JSON.stringify(J.annotations));
        const J2 = await load('baja/bio/knowledge/selection-json.js', t,
            { xi: EX1[1] - 50, xf: INTRON[0] + 50 }, {});
        ok(J2.annotations.length === 1 && J2.annotations[0].clipped === true,
           'and an exon the selection cuts through is listed, marked as clipped: '
           + JSON.stringify(J2.annotations));
        ok(J.sequence === SEQ.slice(INTRON[0], INTRON[1] + 1), 'the sequence travels with it');
        ok(/^STMN2-chr8-\d+-\d+\.json$/.test(J.file), 'and it has a filename to be kept under: ' + J.file);
    }

    // ---- the model is NOT given the sequence ---------------------------------------------
    // A model holding the sequence can copy any substring into its answer, and every claim
    // then "verifies" wherever it came from. This is the whole reason the check means
    // anything.
    {
        reply = { features: [], notes: 'nothing here', searched: true };
        await run(mkGraph(), mkTrack(), { xi: INTRON[0], xf: INTRON[1] });
        const sent = JSON.parse(asked[0]);
        ok(!sent.sequence, 'THE SEQUENCE IS WITHHELD from the model: ' + JSON.stringify(Object.keys(sent)));
        ok(sent.gene === 'STMN2' && sent.introns.length === 1 && sent.genomic.start,
           'while everything it needs to identify the locus is sent');
    }

    // ---- a real answer: one true claim, one invented, one about the wrong place ----------
    {
        reply = { searched: true, notes: '', features: [
            { label: 'cryptic exon 2a', kind: 'cryptic exon', what: 'included when TDP-43 is lost',
              anchor: CRYPTIC, stated_start: 79611117 + CRYPTIC_AT + 4000,
              evidence: { title: 'Klim et al.', url: 'https://example.org/klim', year: 2019 } },
            { label: 'invented site', kind: 'rbp site', what: 'not real',
              anchor: 'TTTTTGGGGGCCCCCAAAAATTTTTGGGGG', evidence: { title: 'x' } },
            { label: 'in exon 5 somewhere else', kind: 'variant', what: 'outside this selection',
              anchor: 'GGGGGGGGGGGGGGGGCCCCCCCCCCCCCCCC', evidence: { title: 'y' } }
        ] };
        const g = mkGraph(), t = mkTrack();
        const r = await run(g, t, { xi: INTRON[0], xf: INTRON[1] });

        ok(r.placed.length === 1 && r.unplaceable.length === 2,
           'only the claim whose sequence is actually here is drawn: ' + JSON.stringify(r.placed.map((p) => p.label)));
        ok(r.placed[0].xi === CRYPTIC_AT,
           'AT ITS SEQUENCE, not where the paper said: ' + r.placed[0].xi + ' vs stated '
           + (r.placed[0].stated_start - 79611117));
        ok(r.placed[0].stated_off_by === -4000, 'with the discrepancy kept: ' + r.placed[0].stated_off_by);

        ok(t.track_layers.length === 1, 'a layer is added');
        const L = t.track_layers[0];
        ok(/^Knowledge/.test(L.name), 'named so it cannot be mistaken for the track\'s own data: ' + L.name);
        ok(L.intervals.length === 1 && L.intervals[0].x1 === CRYPTIC_AT, 'with one band, where it was found');
        ok(L.intervals[0].t === 'cryptic exon 2a', 'labelled');
        ok(L.decor && L.decor.help && L.decor.help.rows.length === 1, 'and a "?" that opens the detail');
        ok(/Klim et al\./.test(L.decor.help.rows[0][1]), 'carrying the citation: ' + L.decor.help.rows[0][1]);
        // stated_off_by is (where it is) minus (where it was said to be), so a negative
        // number means the source placed it LATER than its own sequence turned out to be.
        ok(/4000 bases later/.test(L.decor.help.rows[0][1]),
           'and how far the source was out, in the direction it was out: ' + L.decor.help.rows[0][1]);
        ok(/2 further claims were left out/.test(L.decor.help.note),
           'the dropped claims are counted where the layer is read: ' + L.decor.help.note.slice(-120));
        ok(/placed by finding/.test(L.decor.help.note), 'and the note says how any of this got here');
        ok(g.results.some((m) => /1 of 3 published claims found in the sequence and drawn/.test(m)),
           'the result line is the honest fraction: ' + g.results[0]);
    }

    // ---- nothing published is an answer, not a failure -----------------------------------
    {
        reply = { searched: true, features: [], notes: 'The cryptic exon of this gene is in intron 1, not here.' };
        const g = mkGraph(), t = mkTrack();
        const r = await run(g, t, { xi: EX2[0], xf: EX2[1] });
        ok(r.placed.length === 0 && t.track_layers.length === 0, 'no layer is drawn for nothing');
        ok(g.results.some((m) => /nothing published was found/.test(m) && /not here/.test(m)),
           'and the model\'s own note comes through: ' + g.results[0]);
    }

    // ---- every claim failing its check is a pointed result -------------------------------
    {
        reply = { searched: true, features: [
            { label: 'a', anchor: 'TTTTTGGGGGCCCCCAAAAATTTTT', evidence: {} },
            { label: 'b', anchor: 'AAAAACCCCCGGGGGTTTTTAAAAA', evidence: {} }] };
        const g = mkGraph(), t = mkTrack();
        await run(g, t, { xi: INTRON[0], xf: INTRON[1] });
        ok(t.track_layers.length === 0, 'nothing is drawn');
        ok(failed.some((m) => /None of the 2 published claims could be found/.test(m)),
           'and it says so, with an example: ' + failed[0]);
    }

    // ---- an uncited run says it is uncited -------------------------------------------------
    {
        reply = { searched: false, features: [
            { label: 'from memory', kind: 'cryptic exon', what: 'no search was available',
              anchor: CRYPTIC, evidence: {} }] };
        const t = mkTrack(), g = mkGraph();
        await run(g, t, { xi: INTRON[0], xf: INTRON[1] });
        ok(/web search was unavailable/.test(g.results[0] || ''), 'the result line says so: ' + g.results[0]);
        ok(/uncited/.test(t.track_layers[0].decor.help.note), 'and so does the layer');
    }

    // ---- what it refuses -------------------------------------------------------------------
    {
        const g = mkGraph();
        await run(g, mkTrack(), {});
        ok(failed.some((m) => /Select the stretch/.test(m)), 'no selection, no lookup: ' + failed[0]);
        const g2 = mkGraph();
        await run(g2, mkTrack(), { xi: 0, xf: 400000 });
        ok(failed.some((m) => /400 kb/.test(m) && /a locus, not a chromosome/.test(m)),
           'and a selection too big to be a locus: ' + failed[0]);
    }

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
