// A TRACK NAME IS A PLACE YOU CAN GO TO.
//
//     node tools/test/goto-a-track.js
//
// "goto dnm3_3utr" was read as a track plus a region -- the 3' UTR of DNM3_3utr -- and
// that track cannot have one: it IS the 3' UTR, cut out as a track of its own, so it
// carries no coding region and therefore no UTRs. The answer came back as "cannot run",
// which is true of the reading and useless as an answer to the sentence. Two readings are
// checked here: the name as a place, and a region asked for on a track that already is it.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

global.window = { env: { apiUrl: '' } };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

const said = [];
const framed = [];
const mkTrack = (name, xi, xf, anns) => ({
    name: name, xi: xi, xf: xf, strand: 1, annotations: anns || [], track_layers: [],
    tgraph: { X: (v) => v, yi: 0 }, addLayer(l) { this.track_layers.push(l); }
});
// DNM3 is a whole gene with exons and a CDS; DNM3_3utr is its 3' UTR cut out, which has
// neither, which is the case that failed.
const DNM3 = mkTrack('DNM3', 1000, 9000, [
    { type: 'Exon', name: 'e1', xi: 1000, xf: 1200 },
    { type: 'Exon', name: 'e2', xi: 5000, xf: 5200 },
    { type: 'Translation', name: 'CDS', xi: 1100, xf: 5100 }
]);
const UTR = mkTrack('DNM3_3utr', 5101, 9000, []);
const DNM1 = mkTrack('DNM1', 100, 900, []);

const graph = {
    track: [DNM3, UTR, DNM1], wake: () => { }, rescale: () => { },
    setMessage: (m) => said.push(m), setResultMessage: (m) => said.push(m),
    clearSequenceSelections: () => { },
    zoomXY: (a, b, c, d) => { framed.push([a, b]); },
    slideZoomTo: async (a, b) => { framed.push([a, b]); },
    getxmin: () => 0, getxmax: () => 10000, getymin: () => 0, getymax: () => 10,
    graph: { grid: { height: 800, yinset: 0 } }
};
const last = () => said[said.length - 1] || '';

(async () => {
    const CAP = await load('baja/manchester/menu/editor-capabilities.js', graph, {});
    const goto = (CAP.list || []).filter((c) => c.name === 'go_to_position')[0];
    ok(!!goto, 'go_to_position is there');

    // ---- THE NAME AS A PLACE -------------------------------------------------------------
    said.length = 0; framed.length = 0;
    await goto.run({ position: 'dnm3_3utr' });
    ok(/DNM3_3utr/.test(last()) && /the whole track/.test(last()),
       '"goto dnm3_3utr" frames that track: ' + last());
    ok(/3,900 bases/.test(last()), 'and says how much of it that is: ' + last());
    ok(graph.selectedTrack === UTR, 'and the track is the one selected');
    ok(/frame the whole of DNM3_3utr/.test(goto.preview({ position: 'dnm3_3utr' })),
       'the card says so before it runs: ' + goto.preview({ position: 'dnm3_3utr' }));

    // Typed the way it is said: case and punctuation are not the name.
    said.length = 0;
    await goto.run({ position: 'DNM3 3UTR' });
    ok(/DNM3_3utr/.test(last()), 'spelled with a space and in capitals it is the same track');
    said.length = 0;
    await goto.run({ position: 'dnm1' });
    ok(/DNM1/.test(last()) && /whole track/.test(last()), 'and so is a plain gene name');

    // AN EXACT NAME WINS OUTRIGHT, even though DNM3_3utr also contains it: somebody who
    // types the whole of a name has named that track.
    said.length = 0;
    await goto.run({ position: 'dnm3' });
    ok(/DNM3 \u00b7 the whole track/.test(last()) && /8,001/.test(last()),
       '"dnm3" is the DNM3 track, not the one whose name merely contains it: ' + last());

    // A PARTIAL NAME THAT FITS TWO IS NOT GUESSED AT: going to the wrong track is worse
    // than asking which.
    graph.track.push(mkTrack('DNM1_3utr', 700, 900, []));
    said.length = 0;
    await goto.run({ position: '3utr' });
    ok(!/the whole track/.test(last()),
       '"3utr" fits two tracks, so nothing is framed blind: ' + last());
    graph.track.pop();

    // ---- A REGION ASKED FOR ON A TRACK THAT ALREADY IS IT ---------------------------------
    // This is what the planner actually sent, and the refusal it produced.
    said.length = 0;
    await goto.run({ position: "the 3' UTR", track: 'DNM3_3utr' });
    ok(/whole track/.test(last()) && /3′ UTR/.test(last()),
       'the 3′ UTR of a track that IS the 3′ UTR is the whole of it: ' + last());
    ok(!/no annotated coding region/.test(last()),
       'rather than a refusal that is true of the annotations and wrong about the track');

    // The same question on a track that really has no such region is still refused: the
    // fallback is about the name saying what the track is, not about never saying no.
    said.length = 0;
    await goto.run({ position: "the 3' UTR", track: 'DNM1' });
    ok(/no annotated coding region/.test(last()),
       'a track with no UTR and no name saying otherwise is still refused: ' + last());

    // And a real region on a real transcript is unaffected.
    said.length = 0;
    await goto.run({ position: 'exon 2', track: 'DNM3' });
    ok(/exon 2 of 2/.test(last()), 'a named region on a transcript still resolves: ' + last());

    const caps = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8');
    ok(/A TRACK NAME IS ALSO A PLACE/.test(caps),
       'and the planner is told, so it stops splitting a name into a track and a region');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
