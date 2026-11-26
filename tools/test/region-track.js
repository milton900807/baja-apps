// CUTTING A NAMED REGION OUT OF A TRACK, AS A TRACK OF ITS OWN.
//
//     node tools/test/region-track.js
//
// "cut the 3' UTR from DNM3 and DNM1" had no answer: the editor knew where the 3' UTR was
// and could copy a track, and nothing joined the two. What matters about the join is that
// the piece says the same thing the parent did about the same bases: the sequence is the
// sequence at those coordinates, the coordinates are the parent's and not renumbered from
// one, and the annotations carried over are clipped rather than left claiming an extent the
// track no longer has.
//
// A MINUS-STRAND TRANSCRIPT IS THE CASE THAT MATTERS. Its 3' UTR is at the LOW coordinate,
// so a cut that works by position rather than by transcript order hands back the 5' UTR
// under the wrong name, on exactly the genes where someone is designing against one end.
const fs = require('fs');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const core = fs.readFileSync('lib/core.js', 'utf8');
global.window = { env: { apiUrl: '' } };
global.isMobile = () => false;

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const load = async (p, ...a) => {
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

// A transcript as the editor holds one: genomic coordinates, exons and a Translation span
// as annotations, and a sequence that starts at xi. copyTrack is the real contract this
// leans on, so the stand-in copies the way the Track class does: every collection rebuilt.
const base = 1000;
const seqOf = (n) => { let s = ''; for (let i = 0; i < n; i++) s += 'ACGT'[i % 4]; return s; };
const mkTrack = (name, strand) => {
    const t = {
        name: name, xi: base, xf: base + 999, strand: strand, sequence: seqOf(1000),
        chr: 'chr1', species: 'Human', transcriptID: 'ENST1', geneID: 'G1',
        snpindels: [{ xi: 1150, name: 'v_in_5utr' }, { xi: 1850, name: 'v_in_3utr' }],
        oligos: [{ xi: 1860, xf: 1879, name: 'aso1' }],
        structures: [], track_layers: [{ name: 'PSI' }],
        annotations: [
            { type: 'Exon', name: 'e1', xi: 1000, xf: 1299 },
            { type: 'Exon', name: 'e2', xi: 1500, xf: 1999 },
            { type: 'Translation', name: 'tr', xi: 1200, xf: 1700 },
            { type: 'Domain', name: 'DYNc', xi: 1250, xf: 1320 }
        ],
        grid: { xi: 0, yi: 0, width: 1000, height: 10, setxmin(v) { this.xmin = v; }, setxmax(v) { this.xmax = v; }, rescale() { }, Y: (v) => v },
        select() { this.selected = true; },
        copyTrack(nm) {
            const c = Object.assign({}, this);
            c.name = nm;
            c.annotations = this.annotations.map((a) => Object.assign({}, a));
            c.snpindels = this.snpindels.map((v) => Object.assign({}, v));
            c.oligos = this.oligos.map((v) => Object.assign({}, v));
            c.structures = [];
            c.track_layers = this.track_layers.map((l) => Object.assign({}, l));
            c.grid = Object.assign({}, this.grid);
            return c;
        }
    };
    return t;
};
const mkGraph = () => {
    const said = [];
    return { track: [], said: said, setMessage: (m) => said.push(m), wake: () => { },
        deselectAllTracks: () => { }, clearMouseListeners: () => { }, animateTo: () => { } };
};
const cut = async (t, spec, opts) => {
    const g = mkGraph();
    const r = await load('baja/bio/tracks/region-track.js', g, t, spec, opts || {}, null);
    return { r: r, g: g, said: g.said.join(' | ') };
};

(async () => {
    // ---- plus strand: the 3' UTR is the stretch after the stop ---------------------------
    const plus = mkTrack('DNM3', 1);
    const a = await cut(plus, { region: 'three_prime_utr' });
    ok(!a.r.error, 'the 3’ UTR comes out: ' + (a.r.error || ''));
    ok(a.r.name === 'DNM3_3utr', 'named the way it would be typed: ' + a.r.name);
    ok(a.r.start === 1701 && a.r.end === 1999, 'from the base after the stop to the end of the transcript: ' + a.r.start + '-' + a.r.end);

    // THE SEQUENCE IS THE SEQUENCE AT THOSE COORDINATES. Off by one here is a reading frame
    // and an ASO that targets the wrong bases, and nothing on screen would show it.
    const made = a.g.track[0];
    ok(made.sequence === plus.sequence.substring(1701 - base, 2000 - base), 'and it is those bases of the parent, not a shift of them');
    ok(made.sequence.length === a.r.length && a.r.length === 299, 'length matches the span: ' + a.r.length);

    // COORDINATES ARE THE PARENT'S. Renumbering from one would make a variant at 1,850 land
    // at 150 and stop meaning anything against the gene.
    ok(made.xi === 1701 && made.xf === 1999, 'the piece keeps the parent’s frame');
    ok((made.snpindels || []).length === 1 && made.snpindels[0].name === 'v_in_3utr', 'variants inside come, those outside do not');
    ok((made.oligos || []).length === 1, 'and so do compounds inside the window');
    ok((made.track_layers || []).length === 0 && a.r.layersDropped === 1, 'data layers are not carried over');
    ok(/Data layers were not carried over/.test(a.said), 'and the message says so');

    // ANNOTATIONS ARE CLIPPED, NOT LEFT CLAIMING AN EXTENT THE TRACK HAS NOT GOT.
    const e2 = (made.annotations || []).filter((x) => x.name === 'e2')[0];
    ok(!!e2 && e2.xi === 1701 && e2.xf === 1999, 'the exon that straddles the edge is clipped to the window');
    ok(e2 && e2.clippedToRegion === true, 'and marked as clipped');
    ok(!(made.annotations || []).some((x) => x.name === 'e1'), 'an annotation entirely outside is dropped');
    ok(a.r.clipped === 1, 'the clipped ones are counted: ' + a.r.clipped);
    // The coding span ENDS at the last base of the stop codon, so a 3' UTR that begins one
    // base later holds none of it. A UTR carrying a coding base is the kind of off-by-one
    // that survives every visual check and ruins a frame.
    ok(!(made.annotations || []).some((x) => x.type === 'Translation'),
       'and no part of the coding span is inside the 3\u2019 UTR');

    // ---- minus strand: the 3' UTR is at the LOW coordinate -------------------------------
    const minus = mkTrack('STMN2', -1);
    const b = await cut(minus, { region: 'three_prime_utr' });
    ok(!b.r.error && b.r.end === 1199, 'on a minus-strand transcript the 3’ UTR is the low end: '
        + b.r.start + '-' + b.r.end);
    const c = await cut(mkTrack('STMN2', -1), { region: 'five_prime_utr' });
    ok(!c.r.error && c.r.start === 1701, 'and its 5’ UTR is the high end: ' + c.r.start + '-' + c.r.end);
    ok(b.r.end < c.r.start, 'the two are not the same stretch under two names');

    // ---- a numbered exon, counted along the transcript ------------------------------------
    const d = await cut(mkTrack('DNM3', 1), { region: 'exon', index: 1 });
    ok(d.r.name === 'DNM3_exon1' && d.r.start === 1000 && d.r.end === 1299, 'exon 1 of a plus-strand track: ' + d.r.name);
    const e = await cut(mkTrack('STMN2', -1), { region: 'exon', index: 1 });
    ok(e.r.start === 1500, 'exon 1 of a minus-strand track is the one at the high end: ' + e.r.start);

    // ---- any annotation, by the name it is drawn under ------------------------------------
    const f = await cut(mkTrack('DNM3', 1), { region: 'annotation', name: 'DYNc' });
    ok(!f.r.error && f.r.name === 'DNM3_DYNc' && f.r.start === 1250 && f.r.end === 1320,
       'a domain comes out under its own name: ' + (f.r.error || f.r.name));
    const g2 = await cut(mkTrack('DNM3', 1), { region: 'annotation', name: 'nonesuch' });
    ok(/no annotation called/.test(g2.r.error || ''), 'and a name the track does not carry says so');
    ok(/DYNc/.test(g2.r.error || ''), 'listing what it does carry: ' + (g2.r.error || ''));

    // ---- a slice that spans an intron says so --------------------------------------------
    const h = await cut(mkTrack('DNM3', 1), { region: 'cds' });
    ok(h.r.pieces === 2, 'the CDS of this transcript lies on two exons');
    ok(/run Create mRNA on it for the spliced version/.test(h.said),
       'so the message says the introns came too and where the spliced version is');
    ok(h.r.exonic < h.r.length, 'and the exonic content is less than the span: '
        + h.r.exonic + ' of ' + h.r.length);

    // ---- a name of your own, and the refusals ---------------------------------------------
    const i = await cut(mkTrack('DNM3', 1), { region: 'three_prime_utr' }, { name: 'dnm3_tail' });
    ok(i.r.name === 'dnm3_tail', 'a name given is the name used');
    const j = await cut(mkTrack('DNM3', 1), { region: 'exon', index: 9 });
    ok(/has 2 exons, so there is no exon 9/.test(j.r.error || ''), 'an exon that is not there is refused by name: ' + (j.r.error || ''));
    const noSeq = mkTrack('DNM3', 1); noSeq.sequence = '';
    const k = await cut(noSeq, { region: 'cds' });
    ok(/no sequence loaded/.test(k.r.error || ''), 'and a track with no sequence is refused before anything is made');

    console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
