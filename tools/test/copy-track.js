// A COPY OF A TRACK IS SEPARATE FROM IT.
//
//     node tools/test/copy-track.js
//
// "copy this track to new track called pathogenic" was answered with "not something the
// editor can do: copying or duplicating a track". It is an ordinary thing to want: keep the
// original whole and cut the copy down to the part being worked on, which is usually what
// the name says it is for.
//
// The one thing a copy must get right is that it is NOT the original. If the two share their
// annotations array, or share the annotation objects inside it, then deleting the benign
// variants from the copy deletes them from the original too, and the reason for making a
// copy is gone.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// The real copyTrack, lifted from the Track class with its braces counted, and given the
// smallest world it needs: a Track to construct and a grid to place.
const liftMethod = (file, head) => {
    const src = fs.readFileSync(file, 'utf8');
    const at = src.indexOf(head);
    if (at < 0) throw new Error('no ' + head + ' in ' + file);
    let depth = 0, end = -1;
    for (let i = src.indexOf('{', at); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    const body = src.slice(at, end).replace(/^copyTrack/, 'function');
    // eslint-disable-next-line no-eval
    return eval('(function (Track) { return (' + body + '); })');
};

const mkGrid = (yi, h) => ({
    xi: 0, yi: yi, width: 100, height: h, xmin: 0, xmax: 100,
    setxmin(v) { this.xmin = v; }, setxmax(v) { this.xmax = v; },
    setymax() { }, setymin() { }, setSize() { }, setInset() { }, rescale() { this.rescaled = true; }
});
function Track(name, xi, xf, y, strand) {
    this.name = '' + name; this.xi = xi; this.xf = xf; this.y = y; this.strand = strand;
    this.grid = mkGrid(0, -40);
    this.annotations = []; this.oligos = []; this.snpindels = []; this.structures = [];
    this.genomicsCoord = []; this.track_layers = []; this.highlight_features = {};
}
// Items with classes of their own, as the real ones have: a copy must keep the class, or a
// layer redraws with the wrong painter and an annotation loses its methods.
function Annotation(type, name, xi, xf) { this.type = type; this.name = name; this.xi = xi; this.xf = xf; }
Annotation.prototype.width = function () { return this.xf - this.xi; };
function Variant(id, sig) { this.id = id; this.significance = sig; }
Variant.prototype.label = function () { return this.id + ':' + this.significance; };

const copyTrack = liftMethod('baja/bio/track-flexi.js', 'copyTrack(newName) {')(Track);

const original = () => {
    const t = new Track('MAPK8IP3-216', 0, 100, 0, 1);
    t.sequence = 'ACGTACGTAC';
    t.chr = 'chr16'; t.species = 'human';
    t.transcriptID = 'ENST00000002'; t.geneID = 'ENSG00000003';
    t.description = 'JIP3'; t.track_type = 'GENE'; t.targetPhase = 2;
    t.annotations = [new Annotation('Exon', 'e1', 0, 10), new Annotation('Exon', 'e2', 20, 30)];
    t.snpindels = [new Variant('rs1', 'Pathogenic'), new Variant('rs2', 'Benign')];
    t.oligos = [{ name: 'aso1', __track: t }];
    t.showSnpIndels = false; t.showName = true;
    t.copyLayers = function () { return [{ name: 'clinvar*', track: this }]; };
    return t;
};

(() => {
    let t = original();
    let c = copyTrack.call(t, 'pathogenic');

    // ---- it is a copy -------------------------------------------------------------------
    ok(c.name === 'pathogenic', 'it takes the name asked for: ' + c.name);
    ok(c.sequence === t.sequence && c.chr === 'chr16' && c.strand === 1,
       'with the same sequence and place');
    ok(c.transcriptID === 'ENST00000002' && c.geneID === 'ENSG00000003' && c.species === 'human',
       'and the identity the data layers look a track up by, or the copy quietly matches '
       + 'nothing in a BED and looks empty');
    ok(c.annotations.length === 2 && c.snpindels.length === 2 && c.oligos.length === 1,
       'everything on it came across: ' + [c.annotations.length, c.snpindels.length, c.oligos.length].join('/'));
    ok(c.track_layers.length === 1, 'including the data layers, through their own copier');
    ok(c.showSnpIndels === false && c.showName === true,
       'and it looks the way the original looked');

    // ---- and it is SEPARATE, which is the whole point -----------------------------------
    ok(c.annotations !== t.annotations && c.snpindels !== t.snpindels && c.oligos !== t.oligos,
       'the arrays are new, not the same arrays under a second name');
    ok(c.annotations[0] !== t.annotations[0] && c.snpindels[0] !== t.snpindels[0],
       'and so is every item in them');

    // The thing someone makes a copy FOR.
    c.snpindels = c.snpindels.filter((v) => v.significance === 'Pathogenic');
    ok(c.snpindels.length === 1 && t.snpindels.length === 2,
       'cutting the copy down to the pathogenic variants leaves the original with both: '
       + c.snpindels.length + ' and ' + t.snpindels.length);
    c.annotations[1].name = 'renamed';
    ok(t.annotations[1].name === 'e2',
       'and renaming something on the copy does not rename it on the original: '
       + t.annotations[1].name);

    // ---- the items are still themselves ---------------------------------------------------
    ok(c.annotations[0] instanceof Annotation && typeof c.annotations[0].width === 'function',
       'a copied annotation keeps its class, so it keeps its methods');
    ok(c.snpindels[0] instanceof Variant && c.snpindels[0].label() === 'rs1:Pathogenic',
       'and so does a copied variant: ' + c.snpindels[0].label());

    // Nothing on the copy still points at the original, or an edit made through an item
    // would reach back across.
    ok(c.oligos[0].__track === c, 'an item\'s back-reference points at the copy: '
       + (c.oligos[0].__track === c ? 'copy' : (c.oligos[0].__track === t ? 'STILL THE ORIGINAL' : '?')));
    ok(c.track_layers[0].track === c, 'and so does a layer\'s');

    // ---- where it lands -------------------------------------------------------------------
    ok(c.grid.yi === t.grid.yi + Math.abs(t.grid.height) + 1,
       'it sits one track below the original rather than on top of it: ' + c.grid.yi);
    ok(c.grid.xi === t.grid.xi && c.grid.width === t.grid.width,
       'at the same width and left edge, so the two line up');

    // ---- a name that was not given ---------------------------------------------------------
    t = original();
    c = copyTrack.call(t, '');
    ok(c.name === 'MAPK8IP3-216_copy', 'with no name asked for it is named after the original: ' + c.name);
    c = copyTrack.call(t, '   ');
    ok(c.name === 'MAPK8IP3-216_copy', 'and blank spaces are not a name either');

    // ---- the operation and the capability --------------------------------------------------
    const op = fs.readFileSync('baja/bio/copy-track.js', 'utf8');
    ok(/ensureUniqueTrackName/.test(op),
       'the operation renames a copy whose name is taken rather than refusing: two tracks '
       + 'with one name makes every by-name operation ambiguous');
    ok(/deselectAllTracks[\s\S]{0,80}made\.select\(\)/.test(op),
       'and leaves the copy selected, so the next operation runs on it');
    const cap = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8');
    ok(/name: 'copy_track'/.test(cap), 'copy_track is a declared capability');
    ok(/duplicate this track/.test(cap),
       'and says the words people use for it, so the planner can find it');
    ok(/a\.track \? matchTrack\(a\.track\) : oneTrack\(\)/.test(cap.slice(cap.indexOf("name: 'copy_track'"))),
       '"this track" resolves the same way every other single-track operation resolves it: '
       + 'the selected one, then the only one');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
