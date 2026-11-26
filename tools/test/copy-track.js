// EVERY KIND OF TRACK CAN BE COPIED, AND THE TWO CLASSES COPY THE SAME WAY.
//
//     node tools/test/copy-track.js
//
// The editor has two Track classes that render the same thing: baja/bio/track.js, which
// load-track.js builds a loaded gene from, and baja/bio/track-flexi.js. copyTrack lived
// only in the flexi one, so a gene loaded from Ensembl answered "DNM3 is not a kind of
// track that can be copied", and then "not a kind of track that can be cut up" when
// region-track.js leaned on the same method. Nothing on screen distinguishes the two
// classes, so the refusal looked like a statement about the gene.
//
// Both methods are read out of their own files and run here, against the same fixture and
// the same assertions, so one of them quietly losing a collection -- or the pair drifting
// apart again -- fails rather than waits to be found by hand.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

// The method text, lifted from the class by matching braces from its signature.
const methodOf = (file, sig) => {
    const src = fs.readFileSync(file, 'utf8');
    const at = src.indexOf(sig);
    if (at < 0) return null;
    let i = src.indexOf('{', at), depth = 0, end = -1;
    for (let k = i; k < src.length; k++) {
        const ch = src[k];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = k; break; } }
    }
    return (end > 0) ? src.slice(at, end + 1) : null;
};

const run = (file, gridName) => {
    const text = methodOf(file, 'copyTrack(newName)');
    ok(!!text, file + ' publishes copyTrack');
    if (!text) return;

    // A stand-in for the class itself: the constructor the method calls, and a grid with
    // the handful of methods it touches.
    const mkGrid = () => ({ xi: 3, yi: 7, width: 500, height: 10, xmin: 1000, xmax: 1999,
        setxmin(v) { this.xmin = v; }, setxmax(v) { this.xmax = v; }, rescale() { this.rescaled = true; } });
    const Track = function (name, xi, xf, y, strand) {
        this.name = name; this.xi = xi; this.xf = xf; this.y = y; this.strand = strand;
        this[gridName] = mkGrid();
    };
    const holder = new Function('Track', 'return ({ ' + text + ' });')(Track);

    class Ann { constructor(o) { Object.assign(this, o); } what() { return this.type; } }
    const layer = { name: 'PSI', track: null };
    const self = {
        name: 'DNM3', xi: 1000, xf: 1999, y: 2, strand: -1, sequence: 'ACGT'.repeat(250),
        chr: 'chr1', species: 'Human', transcriptID: 'ENST1', geneID: 'ENSG1',
        description: 'dynamin 3', track_type: 'GENOMIC', targetPhase: 7, trackRef: { r: 1 },
        gxi: 171841498, gxf: 172412717,
        annotations: [new Ann({ type: 'Exon', name: 'e1', xi: 1000, xf: 1100 })],
        oligos: [{ name: 'aso', xi: 1200 }],
        snpindels: [{ name: 'v', xi: 1300 }],
        structures: [{ s: 1 }],
        genomicsCoord: [1, 2, 3],
        highlight_features: { exon: true },
        track_layers: [layer],
        showPlots: true, showName: false, showSnpIndels: true, hideTrackCoords: true,
        copyLayers() { return this.track_layers.map((l) => Object.assign({}, l)); },
        copyTrack: holder.copyTrack
    };
    layer.track = self;
    self[gridName] = mkGrid();
    const G = (t) => t[gridName];

    const c = self.copyTrack('');
    ok(c.name === 'DNM3_copy', 'an unnamed copy is named after the original');
    ok(self.copyTrack('pathogenic').name === 'pathogenic', 'and a name given is the name used');

    // WHAT THE TRACK IS. A copy that loses transcriptID matches nothing in a BED, which
    // reads as the copy having no data rather than no name.
    for (const k of ['chr', 'species', 'transcriptID', 'geneID', 'description', 'track_type', 'targetPhase']) {
        ok(c[k] === self[k], 'carries ' + k);
    }
    ok(c.sequence === self.sequence, 'and the sequence');
    ok(c.xi === self.xi && c.xf === self.xf && c.strand === self.strand, 'with the same coordinates and strand');
    ok(c.gxi === self.gxi && c.gxf === self.gxf, 'and the genomic ones');

    // EVERY COLLECTION REBUILT, NOT SHARED. Sharing is the whole failure mode: cutting the
    // copy down then empties the original, which is the one thing a copy must not do.
    for (const k of ['annotations', 'oligos', 'snpindels', 'structures', 'genomicsCoord', 'track_layers']) {
        ok(c[k] !== self[k], k + ' is a new array');
    }
    ok(c.annotations[0] !== self.annotations[0], 'each annotation is a new object');
    ok(c.annotations[0].xi === 1000 && c.annotations[0].name === 'e1', 'holding the same values');
    ok(typeof c.annotations[0].what === 'function' && c.annotations[0].what() === 'Exon',
       'and keeping its class, so its methods still work');
    ok(c.highlight_features !== self.highlight_features, 'highlight flags are copied, not shared');

    // ANYTHING POINTING BACK AT THE TRACK POINTS AT THE COPY, or the copy's layer draws on
    // the original.
    ok(c.track_layers[0].track === c, 'a layer on the copy points at the copy');
    ok(self.track_layers[0].track === self, 'and the original keeps its own');

    // Placed one step from the original, not on top of it.
    ok(G(c).xi === G(self).xi, 'same left edge');
    ok(G(c).yi === G(self).yi + Math.abs(G(self).height) + 1, 'one track step away');
    ok(G(c).xmin === G(self).xmin && G(c).xmax === G(self).xmax, 'covering the same window');
    ok(G(c).rescaled === true, 'and rescaled after being moved');

    ok(c.showPlots === true && c.showName === false && c.hideTrackCoords === true,
       'display flags match what was on screen');
};

console.log('baja/bio/track.js');
run('baja/bio/track.js', 'tgraph');
console.log('\nbaja/bio/track-flexi.js');
run('baja/bio/track-flexi.js', 'grid');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
