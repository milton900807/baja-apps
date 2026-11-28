// A SENTENCE ABOUT A GENE, DRAWN ON ITS TRACK.
//
//     node tools/test/annotation-from-prompt.js
//
// The thing that must not happen here is a made-up coordinate drawn as a measured one:
// once it is a band on a track, nothing downstream knows it was a guess, least of all a
// reader six months later. So the model is only allowed to NAME the exon, intron, UTR or
// annotation a feature sits in, and every test below is about that line holding: the
// arithmetic is the editor's, the strand is handled where strands go wrong, an anchor this
// transcript cannot carry is refused by name, and how sure the model is travels with the
// shape instead of being lost on the way to the canvas.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

global.window = { env: { apiUrl: '' } };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
let ANSWER = null, ASKED = null, PROMPTED = null, PROMPT_RETURNS = null;
const load = async (p, ...a) => {
    if (/annotate-from-prompt\.py$/.test(p)) { ASKED = { text: a[0], ctx: JSON.parse(a[1]) }; return ANSWER; }
    if (/prompt-text\.js$/.test(p)) { PROMPTED = a[0]; return PROMPT_RETURNS; }
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

const said = [];
const graph = { setResultMessage: (m) => said.push(m), setMessage: (m) => said.push(m), wake: () => { }, track: [] };

// A four-exon transcript on the plus strand, 1000..1999, with a coding region and both
// UTRs, in the shape baja/bio/track-regions.js reads.
const EX = [[1000, 1099], [1300, 1399], [1500, 1599], [1800, 1999]];
const mkTrack = (strand) => ({
    name: 'DNM1', description: 'DNM1;DNM1-202', transcriptID: 'ENST00000372923',
    contig: '9', strand: (strand == null ? 1 : strand), xi: 1000, xf: 1999,
    annotations: [
        ...EX.map((e, i) => ({ type: 'Exon', name: 'exon ' + (i + 1), xi: e[0], xf: e[1] })),
        { type: 'Translation', name: 'CDS', xi: 1050, xf: 1850 },
        { type: 'domain', name: 'DYNc', xi: 1310, xf: 1390 }
    ],
    track_layers: [], addLayer(l) { this.track_layers.push(l); }
});
const run = (t, o) => load('baja/bio/annotate/annotation-from-prompt.js', graph, t, o);
const last = () => said[said.length - 1] || '';

(async () => {
    // ---- THE EDITOR DOES THE ARITHMETIC ------------------------------------------------
    // A 5' splice site is the END of an exon. The model says so; it never says 1399.
    ANSWER = { regions: [{
        label: 'alternative 5′ splice site', kind: 'splice_site',
        anchor: { region: 'exon', index: 2 }, part: 'end', span: 8,
        why: 'documented in this gene as routing the transcript to NMD', confidence: 'high'
    }], note: '' };
    let t = mkTrack();
    let r = await run(t, { text: 'a regulated alternative 5′ splice site that routes the transcript to NMD' });
    ok(r.ok && r.regions.length === 1, 'the region is placed');
    ok(r.regions[0].start === 1392 && r.regions[0].end === 1399,
       'at the end of exon 2, worked out here and not by the model: '
       + r.regions[0].start + '–' + r.regions[0].end);
    ok(t.track_layers.length === 1, 'and drawn as a layer on the track');
    const L = t.track_layers[0];
    ok(L.intervals.length === 1 && L.intervals[0].x1 === 1392, 'with a band where it belongs');
    ok(/alternative 5′ splice site/.test('' + L.intervals[0].t)
       && /high/.test('' + L.intervals[0].t),
       'labelled with what it is and how sure: ' + L.intervals[0].t);

    // THE CONTEXT SENT IS THE TRACK'S OWN. An exon count remembered from another
    // transcript is how a poison exon lands two exons off.
    ok(ASKED.ctx.exons === 4 && ASKED.ctx.introns === 3,
       'the server is told what this transcript actually has: ' + ASKED.ctx.exons + ' exons');
    ok(ASKED.ctx.has_cds && ASKED.ctx.has_5utr && ASKED.ctx.has_3utr,
       'and which regions it can resolve');
    ok(ASKED.ctx.exon_table.length === 4 && ASKED.ctx.exon_table[1].len === 100,
       'with the exons it has, so an ordinal can be reasoned about');
    ok((ASKED.ctx.annotations || []).indexOf('DYNc') >= 0,
       'and the features already drawn, so they can be referred to by name');

    // ---- THE STRAND, WHERE THIS GOES WRONG ----------------------------------------------
    // "The end of exon 2" is along the TRANSCRIPT. On a minus-strand gene that is the LOW
    // coordinate, and getting it backwards puts a 5' splice site at the 3' end of the exon,
    // which is a different claim about a different piece of sequence.
    // Two things flip together and both are counted along the transcript: WHICH exon is
    // exon 2 (the second from the 5\u2032 end, so the second-highest in coordinate) and
    // which end of it is its end (the low one). Exons here are 1000, 1300, 1500, 1800, so
    // exon 2 on the minus strand is 1500-1599 and its last eight bases are 1500-1507.
    t = mkTrack(-1);
    r = await run(t, { text: 'same thing on the minus strand' });
    ok(r.regions[0].start === 1500 && r.regions[0].end === 1507,
       'on a minus-strand gene exon 2 is counted from the other end, and the end of it is '
       + 'its low coordinate: ' + r.regions[0].start + '\u2013' + r.regions[0].end);
    // ---- WHAT CANNOT BE PLACED IS REFUSED BY NAME ----------------------------------------
    ANSWER = { regions: [
        { label: 'poison exon', anchor: { region: 'exon', index: 9 }, confidence: 'medium', why: 'x' },
        { label: 'PUM1 site', anchor: { region: 'three_prime_utr' }, confidence: 'low', why: 'y' }
    ], note: '' };
    t = mkTrack();
    r = await run(t, { text: 'the poison exon and the PUM1 site' });
    ok(r.ok && r.regions.length === 1 && r.regions[0].label === 'PUM1 site',
       'the one that can be placed is drawn');
    ok(r.refused.length === 1 && /exon 9/.test(r.refused[0]),
       'and the one that cannot is named with the reason: ' + r.refused[0]);
    ok(/Not placed/.test(t.track_layers[0].decor.help.note),
       'which is in the layer, not only in a message that scrolls away');

    // NOTHING DRAWN IS AN ANSWER, and it says which kind of nothing.
    ANSWER = { regions: [], note: 'nothing of that kind is documented in this gene' };
    t = mkTrack();
    said.length = 0;
    r = await run(t, { text: 'the thing that is not there' });
    ok(!r.ok && r.why === 'nothing placed', 'an empty answer is refused rather than drawn');
    ok(/nothing of that kind is documented/.test(last()),
       'with the model’s own reason: ' + last());
    ok(t.track_layers.length === 0, 'and no empty layer is left behind');

    // A server that could not answer says so; it does not come back as "nothing found".
    ANSWER = { error: 'no API key is configured on this host' };
    said.length = 0;
    r = await run(mkTrack(), { text: 'anything' });
    ok(!r.ok && /API key/.test(r.why), 'a server that cannot run says why');
    ok(/could not be read/.test(last()), 'out loud: ' + last());

    // ---- CONFIDENCE TRAVELS WITH THE SHAPE -----------------------------------------------
    ANSWER = { regions: [
        { label: 'documented site', anchor: { region: 'exon', index: 1 }, confidence: 'high', why: 'in the literature' },
        { label: 'guessed site', anchor: { region: 'exon', index: 3 }, confidence: 'low', why: 'genes like this usually have one' }
    ], note: '' };
    t = mkTrack();
    r = await run(t, { text: 'two of them' });
    const iv = t.track_layers[0].intervals;
    ok(iv.length === 2, 'both are drawn');
    ok(iv[0].color !== iv[1].color,
       'in different colours, so the eye sorts them before a word is read');
    ok(/documented/.test(t.track_layers[0].decor.help.note)
       && /outlined ones are what it infers/.test(t.track_layers[0].decor.help.note),
       'and the layer says which is which');
    ok(/READING, NOT A MEASUREMENT/.test(t.track_layers[0].decor.help.note),
       'the layer says plainly that nothing here was measured');
    ok(t.track_layers[0].decor.help.rows.length === 2
       && /genes like this usually have one/.test(t.track_layers[0].decor.help.rows[1].join(' ')),
       'with the reason for each one kept');

    // ---- THE BOX, WHICH IS THE USUAL WAY IN -----------------------------------------------
    ANSWER = { regions: [{ label: 'asked for', anchor: { region: 'cds' }, confidence: 'medium', why: 'z' }], note: '' };
    PROMPT_RETURNS = 'the poison exon';
    t = mkTrack();
    r = await run(t, {});
    ok(!!PROMPTED && /Draw an annotation on DNM1/.test(PROMPTED.title),
       'with no description given it asks for one: ' + (PROMPTED && PROMPTED.title));
    ok(/reading/.test(PROMPTED.message) && /how sure/.test(PROMPTED.message),
       'saying what it will and will not do before anything is typed');
    ok(ASKED.text === 'the poison exon', 'and what is typed is what gets read: ' + ASKED.text);
    PROMPT_RETURNS = null;
    said.length = 0;
    r = await run(mkTrack(), {});
    ok(!r.ok && r.why === 'dismissed', 'closing the box draws nothing');

    // ---- THE WAYS IN -----------------------------------------------------------------------
    const caps = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8');
    ok(/name: 'draw_annotation'/.test(caps), 'a prompt can ask for it');
    ok(/READING, NOT A/.test(caps), 'and the capability says what it is');
    const menu = fs.readFileSync('baja/manchester/menu/mouse-over-highlight.js', 'utf8');
    ok(/Draw an annotation you describe/.test(menu), 'the track menu offers it');
    const py = fs.readFileSync('py/bio/editor/annotate-from-prompt.py', 'utf8');
    ok(/YOU DO NOT PICK COORDINATES/.test(py), 'and the server tells the model the same rule');
    ok(/CONFIDENCE IS NOT POLITENESS/.test(py), 'and what confidence is for');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
