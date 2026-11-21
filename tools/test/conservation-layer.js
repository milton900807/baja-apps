// CONSERVATION, ON THE TRACK, IN THE TRACK'S OWN COORDINATES.
//
//     node tools/test/conservation-layer.js
//
// "now enable specific conservation of this region visually", with a 170 bp stretch
// selected. The full-screen map answers for the whole protein; with a region selected the
// question is narrower, and so is the useful answer: how conserved is THIS, against the
// rest of the same protein, drawn where the bases are.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'https://gene.clinic/', pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
global.navigator = dom.window.navigator;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let helpShown = null, pyCalls = 0, pyReply = null;
const load = async (p, ...a) => {
    const path = '' + p;
    if (path.indexOf('homolog-conservation.py') >= 0) { pyCalls++; return pyReply; }
    if (path.indexOf('decor-help') >= 0) { helpShown = a[0] && a[0].decor && a[0].decor.help; return true; }
    const f0 = fs.existsSync(path) ? path : (fs.existsSync(path + '.js') ? path + '.js' : path);
    const src = fs.readFileSync(f0, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// 60 residues of ORF starting at base 300, so residue r sits at base 300 + r*3.
const NRES = 60, ORF0 = 300;
const mkTrack = () => {
    const cdsi = [];
    for (let r = 0; r < NRES; r++) {
        for (let ci = 0; ci < 3; ci++) {
            cdsi.push({ ci: ci, codon_index: r, index: ORF0 + r * 3 + ci, aa: 'A', codon: 'GCT' });
        }
    }
    return { name: 'MAPK8IP3_mRNA', xi: 0, xf: 1200, sequence: 'A'.repeat(1200),
        orf: { cdsi: cdsi }, track_layers: [], annotations: [],
        addLayer(l) { this.track_layers.push(l); }, getSelectedRanges: () => [] };
};
// The last twenty residues are perfectly conserved, the first forty half as much.
const data = (() => {
    const n = 4, ident = [], simil = [];
    for (let r = 0; r < NRES; r++) {
        ident.push(r >= 40 ? 4 : 2);
        simil.push(r >= 40 ? 4 : 3);
    }
    return { status: 'OK', gene: 'MAPK8IP3', species: 'human', length: NRES,
        profile: { identical: ident, similar: simil, aligned: new Array(NRES).fill(n), n: n },
        species_rows: [{ symbol: 'Mapk8ip3', species_common: 'mouse', identity: 95, states: '' },
                       { symbol: 'Mapk8ip3', species_common: 'rat', identity: 93, states: '' },
                       { symbol: 'MAPK8IP3', species_common: 'dog', identity: 94, states: '' },
                       { symbol: 'syd', species_common: 'fly', identity: 42, states: '' }],
        blocks: [] };
})();

(async () => {
    const graph = { said: [], wake() { }, setMessage(m) { this.said.push('' + m); },
        setResultMessage(m) { this.said.push('' + m); } };

    // ---- the conserved stretch, selected -----------------------------------------------
    let t = mkTrack();
    // residues 41-60, which start at base 300 + 40*3
    let r = await load('baja/bio/conservation-layer.js', graph, t, data,
        { start: ORF0 + 40 * 3, end: ORF0 + 60 * 3 });
    ok(!r.error, 'it draws: ' + (r.error || '(no error)'));

    const lay = (t.track_layers || [])[0];
    ok(!!lay && lay.data_type === 'CONSERVATION', 'a conservation layer is on the track');
    ok(lay.name === 'MAPK8IP3_mRNA_conservation', 'named after the track: ' + lay.name);
    ok((lay.polygonpts || []).length > NRES,
       'as a trace, at least two points per codon so it is a profile and not a comb: '
       + (lay.polygonpts || []).length);

    // THE TRACE IS IN BASES, THE DATA IS IN RESIDUES: a peak must sit on the codon that
    // earned it, not on an index into the protein.
    const at = (x) => {
        let best = null;
        for (const p of lay.polygonpts) {
            if (p.x <= x && (best === null || p.x > best.x)) best = p;
        }
        return best ? -best.y : null;
    };
    ok(Math.abs(at(ORF0 + 45 * 3) - 1) < 0.001,
       'the conserved end of the ORF is full height at its own bases: ' + at(ORF0 + 45 * 3));
    ok(Math.abs(at(ORF0 + 10 * 3) - 0.5) < 0.001,
       'and the half-conserved end is half height: ' + at(ORF0 + 10 * 3));
    ok(at(ORF0 - 30) === null || at(ORF0 - 30) === 0,
       'nothing is drawn before the ORF starts, since a UTR has no residue to be conserved');

    // ---- the number is only worth anything against the rest -------------------------------
    const text = (helpShown.rows || []).map((x) => x.join(' ')).join(' | ');
    ok(/100\.0% identical against 66\.7% for the whole protein/.test(text),
       'the region is measured against the whole protein: ' + text.slice(0, 150));
    ok(/MORE conserved than the rest of the gene/.test(text),
       'and said in those words, not left as two numbers to subtract');
    ok(/residues 41–60/.test(text), 'with which residues it covers: '
       + (/residues [\d–]+/.exec(text) || [''])[0]);
    ok(/mouse \(Mapk8ip3\)/.test(text) && /fly \(syd\)/.test(text),
       'and which species the percentage is across, since it means nothing without them');

    // ---- the less conserved stretch reads the other way ------------------------------------
    t = mkTrack(); helpShown = null;
    r = await load('baja/bio/conservation-layer.js', graph, t, data,
        { start: ORF0, end: ORF0 + 40 * 3 });
    ok(/LESS conserved than the rest of the gene/.test((helpShown.rows || []).map((x) => x.join(' ')).join(' ')),
       'a poorly conserved stretch is called that: '
       + ((helpShown.rows || [])[0] || [])[1]);

    // ---- a selection off the ORF is an answer about the selection ---------------------------
    t = mkTrack(); helpShown = null;
    r = await load('baja/bio/conservation-layer.js', graph, t, data, { start: 10, end: 200 });
    const t3 = (helpShown.rows || []).map((x) => x.join(' ')).join(' ');
    ok(/no coding bases/.test(t3) && /no protein conservation/.test(t3),
       'a UTR selection is told it has no residues rather than being given a zero: '
       + t3.slice(0, 120));
    ok(/not because nothing is conserved/.test(t3),
       'and the difference is spelled out, since an empty trace reads as "not conserved"');

    // ---- drawn twice is drawn once ----------------------------------------------------------
    t = mkTrack();
    await load('baja/bio/conservation-layer.js', graph, t, data, null);
    await load('baja/bio/conservation-layer.js', graph, t, data, null);
    ok((t.track_layers || []).filter((l) => l.data_type === 'CONSERVATION').length === 1,
       'asking twice replaces rather than stacks: ' + (t.track_layers || []).length);

    // ---- a different transcript is refused ---------------------------------------------------
    t = mkTrack();
    const longer = JSON.parse(JSON.stringify(data));
    longer.length = NRES + 40;
    longer.profile.identical = longer.profile.identical.concat(new Array(40).fill(4));
    longer.profile.similar = longer.profile.similar.concat(new Array(40).fill(4));
    r = await load('baja/bio/conservation-layer.js', graph, t, longer, null);
    ok(/different transcripts/.test(r.error || ''),
       'a residue number from another protein points at the wrong codon, and it says so: '
       + r.error);
    ok(!(t.track_layers || []).length, 'and nothing is drawn');

    // ---- looked up once per gene --------------------------------------------------------------
    // The homology call is the better part of a minute; the map and the trace want the same
    // answer, and asking twice spends that minute again for nothing.
    const tr = mkTrack();
    const g2 = { track: [tr], said: [], getTracks: () => [tr],
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); } };
    const C = await load('baja/manchester/menu/editor-capabilities.js', g2, {});
    ok(C.catalogue().some((c) => c.name === 'draw_conservation'), 'the operation exists');
    pyReply = data; pyCalls = 0;
    try { delete window.__bajaConservationCache; } catch (e) { }
    await C.preview({ capability: 'draw_conservation', args: { track: 'MAPK8IP3_mRNA' } })
        .capability.run({ track: 'MAPK8IP3_mRNA' });
    ok(pyCalls === 1, 'the first ask reaches Ensembl: ' + pyCalls);
    await C.preview({ capability: 'draw_conservation', args: { track: 'MAPK8IP3_mRNA' } })
        .capability.run({ track: 'MAPK8IP3_mRNA' });
    ok(pyCalls === 1, 'the second does not, for the same gene: ' + pyCalls);
    await C.preview({ capability: 'conservation_map', args: { track: 'MAPK8IP3_mRNA' } })
        .capability.run({ track: 'MAPK8IP3_mRNA' });
    ok(pyCalls === 1, 'and neither does the full-screen map, which wants the same answer: ' + pyCalls);
    try { window.__bajaConservationMap.destroy(); } catch (e) { }

    const p = C.preview({ capability: 'draw_conservation', args: { track: 'MAPK8IP3_mRNA' } });
    ok(/select a stretch first/.test(p.text),
       'with nothing selected the card says what a selection would add: ' + p.text);

    const bare = { name: 'plain', xi: 0, xf: 100, track_layers: [], getSelectedRanges: () => [] };
    const g3 = { track: [bare], getTracks: () => [bare], setMessage() { }, setResultMessage() { } };
    const C3 = await load('baja/manchester/menu/editor-capabilities.js', g3, {});
    const p3 = C3.preview({ capability: 'draw_conservation', args: {} });
    ok(/no reading frame/.test(p3.blocker || ''),
       'a track with no ORF is refused before the button: ' + (p3.blocker || ''));

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
