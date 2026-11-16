// BUILDING THE mRNA FROM A GENE TRACK.
//
//     node tools/test/create-mrna.js
//
// "Create mRNA from dnm1" came back as nothing the editor can do, while both right-click
// menus have carried a Create mRNA item all along -- the same twenty lines, written twice.
// The catalogue is what a typed request can reach, so a thing that lives only in a menu
// does not exist to anyone who asks for it in words.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), isMobile: () => false };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// A track the way the editor builds one, with just enough of it to be spliced.
const mkTrack = (name, seq, exons) => {
    const t = {
        name: name, sequence: seq, chr: 'chr9', strand: 1, species: 'Human',
        transcriptID: 'ENST1', geneID: 'ENSG1', description: 'd', targetPhase: 7,
        annotations: exons.map((e) => ({ type: 'Exon', xi: e[0], xf: e[1] })),
        grid: { xi: 0, yi: 0, height: 10 },
        getExons() { return this.annotations.filter((a) => a.type === 'Exon'); },
        createTrackFromAnnotation(kind) {
            // what track-flexi does, in miniature: the exons joined, named after the kind
            const joined = this.getExons().map((e) => seq.slice(e.xi, e.xf + 1)).join('');
            return {
                name: this.name + (/^(cdna|mrna)$/i.test(kind) ? '_mRNA' : ('_' + kind)),
                sequence: joined, species: this.species, transcriptID: this.transcriptID,
                geneID: this.geneID, built_from: kind,
                tgraph: { xi: 0, width: joined.length, Y: (v) => v },
                select() { this.selected = true; },
                syncFromParent() { this.synced = true; }
            };
        }
    };
    return t;
};
const mkGraph = () => {
    const g = { track: [], said: [], animated: null, deselected: 0 };
    g.setMessage = (m) => g.said.push('' + m);
    g.clearMouseListeners = () => { };
    g.deselectAllTracks = () => { g.deselected++; };
    g.animateTo = (...a) => { g.animated = a; };
    g.ensureUniqueTrackName = (t) => { t.unique = true; return t; };
    return g;
};

(async () => {
    const run = (g, t, part) => load('baja/bio/orfs/make-mrna.js', g, t, part || 'CDNA', null);

    // DNM1-shaped: three exons out of a longer genomic span
    const g = mkGraph();
    const t = mkTrack('DNM1', 'AAAAACCCCCGGGGGTTTTT', [[0, 4], [10, 14]]);
    let r = await run(g, t);
    ok(!r.error, 'it builds: ' + JSON.stringify(r));
    ok(g.track.length === 1, 'and the track goes on the canvas');
    const made = g.track[0];
    ok(made.sequence === 'AAAAAGGGGG', 'the exons are joined with the intron left out: ' + made.sequence);
    ok(made.name === 'DNM1_mRNA', 'named after what it is');
    ok(r.length === 10 && r.exons === 2, 'the reply counts what was built: ' + JSON.stringify(r));

    // the identity that the transcript-keyed layers look it up by
    ok(made.transcriptID === 'ENST1' && made.geneID === 'ENSG1' && made.species === 'Human',
       'transcript, gene and species are carried onto it, so the data layers still find it');
    ok(made.targetPhase === 7, 'and the target phase, which the designer reads');

    // and it is ready to be worked on
    ok(made.selected === true, 'the new track is selected, so the models can run on it next');
    ok(made.synced === true, 'its data is synced from the parent');
    ok(made.unique === true, 'and its name is made unique against the canvas');
    ok(!!g.animated, 'the view moves to it');
    ok(/DNM1_mRNA: 10 nt from 2 exons/.test(g.said.join(' ')), 'and it says what it made: ' + g.said.join(' '));

    // the two ways it can go wrong, said rather than drawn
    r = await run(mkGraph(), mkTrack('Empty', '', [[0, 4]]));
    ok(!!r.error && /no sequence loaded/.test(r.error), 'no sequence is said: ' + r.error);

    const noExons = mkTrack('Genomic', 'AAAAACCCCC', []);
    const g2 = mkGraph();
    r = await run(g2, noExons);
    ok(!!r.error && /no exons annotated/.test(r.error),
       'and a track with no exons is refused rather than copied whole under another name: ' + r.error);
    ok(g2.track.length === 0, 'with nothing added');

    // CDS and Exon build what they say
    const g3 = mkGraph();
    r = await run(g3, mkTrack('DNM1', 'AAAAACCCCCGGGGG', [[0, 4]]), 'CDS');
    ok(g3.track[0].name === 'DNM1_CDS', 'CDS builds a CDS track: ' + g3.track[0].name);

    // ---- one implementation, not three ------------------------------------------------
    for (const menu of ['baja/manchester/menu/edit-current-track.js',
                        'baja/manchester/menu/edit-track.js']) {
        const src = fs.readFileSync(menu, 'utf8');
        ok(/make-mrna\.js/.test(src), menu.split('/').pop() + ' calls the one builder');
        // The Create mRNA item itself, not every use of createTrackFromAnnotation: "Create
        // mutant track" builds one too and deliberately does NOT select it or move the view,
        // which is a different thing wearing similar lines. Folding that one in would change
        // what it does, so it is left where it is.
        const mrnaItem = src.slice(src.indexOf("label: 'Create mRNA'"),
            src.indexOf("label: 'Create mRNA'") + 900);
        ok(!/createTrackFromAnnotation/.test(mrnaItem),
           'and its Create mRNA item no longer carries a copy of the builder');
    }

    // ---- the catalogue, which is what a typed request can reach ------------------------
    const cap = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8');
    ok(/name: 'create_mrna'/.test(cap), 'create_mrna is in the editor catalogue');
    ok(/make-mrna\.js/.test(cap), 'and runs the same builder as the menus');
    ok(/create mRNA from X/.test(cap), 'with the request that failed named in it');
    ok(/values: \['mRNA', 'CDS', 'Exon'\]/.test(cap), 'offering the three things it can build');
    const block = cap.slice(cap.indexOf("name: 'create_mrna'"), cap.indexOf("name: 'design_oligos'"));
    ok(/no exons annotated, so there is nothing to splice/.test(block),
       'and it says a track cannot be spliced BEFORE the button is pressed, not after');
    ok(/has no sequence loaded/.test(block), 'the same for a track with no sequence');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
