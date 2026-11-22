// "COMPARE PEPTIDES BETWEEN TRACK 1 AND 3".
//
//     node tools/test/compare-peptides.js
//
// Two separate reasons that request did not work, neither of them a missing comparison:
// the comparison has been there all along, translating each track's own ORF and aligning
// the peptides on the backend.
//
// The first is vocabulary. The catalogue is the only thing a typed request can reach, and
// it said "proteins" everywhere and "peptides", "ORFs" and "translations" nowhere.
//
// The second is that "track 1 and 3" names no track. Matching was by name only, so both
// names matched nothing, the request fell through to "all the open tracks", and with four
// open it compared four. Position is how someone with several similar transcripts open
// says which two they mean, and the names differ by a suffix nobody wants to type.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let proteins = [];
const load = async (p, ...a) => {
    if (('' + p).indexOf('compare-proteins') >= 0) { proteins.push(a[1]); return { pairs: [] }; }
    if (('' + p).indexOf('compare-track-sequences') >= 0) return true;
    if (('' + p).indexOf('working.js') >= 0) return { step() { }, done() { }, fail() { } };
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const mk = (name) => ({ name: name, markstart: null, markend: null, marks: [],
    orf: { cdsi: [1] }, getSelectedRanges: () => [] });
const mkCap = async (ts) => {
    const graph = { track: ts, said: [], getTracks: () => ts,
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); } };
    return await load('baja/manchester/menu/editor-capabilities.js', graph, {});
};
const run = async (C, args) => {
    proteins = [];
    const p = C.preview({ capability: 'compare_sequences', args: args || {} });
    if (p.ok && !p.blocker) await p.capability.run(p.args);
    return p;
};
const names = () => (proteins[0] || []).map((t) => t.name);

(async () => {
    // Four transcripts of the same gene, which is the case this is for: the names are long
    // and differ by a suffix.
    const T = ['DNM1-201', 'DNM1-204', 'DNM3-201', 'DNM3-208'].map(mk);
    const C = await mkCap(T);

    // ---- by position --------------------------------------------------------------------
    let p = await run(C, { mode: 'protein', tracks: 'track 1, track 3' });
    ok(proteins.length === 1, 'the peptides are compared');
    ok(names().join(',') === 'DNM1-201,DNM3-201',
       'TRACK 1 AND TRACK 3, not all four: ' + names().join(','));
    ok(/compare the translated ORFs of DNM1-201 and DNM3-201/.test(p.text),
       'and the card says which two before anything runs: ' + p.text);

    await run(C, { mode: 'protein', tracks: '2, 4' });
    ok(names().join(',') === 'DNM1-204,DNM3-208', 'bare numbers count too: ' + names().join(','));
    await run(C, { mode: 'protein', tracks: 'first, last' });
    ok(names().join(',') === 'DNM1-201,DNM3-208', 'first and last: ' + names().join(','));
    await run(C, { mode: 'protein', tracks: 'the second track, the third track' });
    ok(names().join(',') === 'DNM1-204,DNM3-201', 'and the words for them: ' + names().join(','));

    // ---- a name is still a name ----------------------------------------------------------
    await run(C, { mode: 'protein', tracks: 'DNM1-204, DNM3-208' });
    ok(names().join(',') === 'DNM1-204,DNM3-208', 'naming them still works: ' + names().join(','));

    // A track whose NAME is a number is found by that name, not by where it sits: an exact
    // name match is taken before position is considered.
    {
        const N = ['alpha', '1', 'gamma'].map(mk);
        const C2 = await mkCap(N);
        await run(C2, { mode: 'protein', tracks: '1, gamma' });
        ok(names().join(',') === '1,gamma',
           'a track called "1" is that track, not the first one: ' + names().join(','));
    }
    // And a name that merely contains a digit is never read as a position.
    await run(C, { mode: 'protein', tracks: 'DNM1-201, DNM3-208' });
    ok(names().join(',') === 'DNM1-201,DNM3-208', 'DNM1 is a name, not track 1');

    // ---- out of range is not the nearest track -------------------------------------------
    {
        const two = ['one', 'two'].map(mk);
        const C3 = await mkCap(two);
        const q = C3.preview({ capability: 'compare_sequences', args: { mode: 'protein', tracks: 'track 1, track 5' } });
        // Track 5 is not there. One track is not a comparison, so this falls back to the two
        // that ARE open, and the card names them: what it will do is on screen either way.
        ok(/compare the translated ORFs of one and two/.test(q.text),
           'a position that is not there does not become the nearest one: ' + q.text);
    }

    // ---- the words that should reach this operation ---------------------------------------
    const cap = C.list.filter((c) => c.name === 'compare_sequences')[0];
    const sum = cap.summary + ' ' + Object.keys(cap.params).map((k) => cap.params[k].about || '').join(' ');
    for (const w of ['peptide', 'ORF', 'translation', 'protein']) {
        ok(new RegExp(w, 'i').test(sum), 'the catalogue says "' + w + '", so a request using it lands here');
    }
    ok(/track 1 and 3/i.test(sum), 'and that a track can be named by where it is');

    // ---- peptides mean whole proteins, not a region ---------------------------------------
    // A named region is a stretch of DNA and has no peptide of its own, so it goes to the
    // nucleotide path rather than pretending to translate it.
    await run(C, { mode: 'protein', region: 'exon', index: 2, tracks: 'track 1, track 2' });
    ok(proteins.length === 0, 'a named region is not sent to the protein aligner');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
