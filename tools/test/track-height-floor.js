// A TRACK NEVER GETS SHORTER THAN 50 PIXELS.
//
//     node tools/test/track-height-floor.js
//
// Zooming out in y raises the y range, and a track's height is a fixed number of world
// units, so far enough out flattens it into a line with its name card and its variants
// piled on top and nothing underneath to read. The existing guard held STACKED tracks
// apart and did nothing at all with fewer than two, which is how a single track ended up
// drawn as a thread across the middle of the screen.
//
// The arithmetic is lifted from flexigraph/gene.js rather than reimplemented: this drives
// the real clamp through a stand-in object carrying the same fields.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const src = fs.readFileSync('flexigraph/gene.js', 'utf8');
// The three pieces that decide the floor, taken verbatim so a change to them is a change
// to this test.
const grab = (start, end) => {
    const i = src.indexOf(start);
    const j = src.indexOf(end, i);
    if (i < 0 || j < 0) throw new Error('could not find ' + start);
    return src.slice(i, j);
};
const body = grab('this.MIN_TRACK_HEIGHT_PX = 50;', 'this.clampYRangeForTracks =')
    + grab('this.clampYRangeForTracks =', 'this.slideZoomByFactor');

const make = (tracks, canvasHeight) => {
    const self = {
        track: tracks,
        graph: { grid: { height: canvasHeight, yinset: 0 } },
        MIN_TRACK_GAP_PX: 15,
        stackedTrackPitchWorld: () => Infinity        // one track: nothing to hold apart
    };
    new Function('self', 'with (self) { ' + body.replace(/this\./g, 'self.') + ' }')(self);
    return self;
};
const track = (yi, height) => ({ tgraph: { yi: yi, height: height, xi: 0, width: 1000 } });

(async () => {
    // ---- ONE TRACK, WHICH IS WHERE THIS WENT WRONG ------------------------------------
    // 800 px of canvas, a track 2 world units tall: at 50 px the widest readable range is
    // 2 * 800 / 50 = 32 world units.
    let g = make([track(10, -2)], 800);
    ok(g.MIN_TRACK_HEIGHT_PX === 50, 'the floor is 50 pixels');
    ok(g.minTrackHeightWorld(0, 100) === 2, 'a track’s height is read as a size, sign and all');
    ok(g.maxYRangeForTrackBody(0, 100) === 32, 'so the widest readable y range is 32: '
       + g.maxYRangeForTrackBody(0, 100));

    let [lo, hi] = g.clampYRangeForTracks(-45, 55);     // 100 units: far too wide
    ok((hi - lo) === 32, 'a zoom-out past it is pulled back to 32: ' + (hi - lo));
    ok(Math.abs(((lo + hi) / 2) - 5) < 1e-9, 'about the same centre, so the view does not jump: '
       + ((lo + hi) / 2));
    const px = (range) => 2 * 800 / range;
    ok(Math.round(px(hi - lo)) === 50, 'which is 50 pixels of track: ' + px(hi - lo));

    // A range that is already fine is left exactly alone.
    [lo, hi] = g.clampYRangeForTracks(0, 20);
    ok(lo === 0 && hi === 20, 'a zoom that keeps the track readable is untouched');

    // ---- THE FLOOR IS THE SHORTEST TRACK, NOT THE AVERAGE -------------------------------
    g = make([track(10, -2), track(20, -1)], 800);
    ok(g.minTrackHeightWorld(0, 100) === 1, 'the shortest body on screen decides it');
    ok(g.maxYRangeForTrackBody(0, 100) === 16, 'so the cap is tighter: '
       + g.maxYRangeForTrackBody(0, 100));

    // A track off screen at this zoom does not hold the view back: it is not being read.
    g = make([track(10, -2), track(5000, -0.2)], 800);
    ok(g.minTrackHeightWorld(0, 100) === 2, 'a track outside the range is not counted');

    // A track that does not say how tall it is gets the 2 units every track gets by default.
    g = make([{ tgraph: { yi: 10, xi: 0, width: 10 } }], 800);
    ok(g.minTrackHeightWorld(0, 100) === 2, 'a track with no height of its own uses the default');

    // ---- BOTH CAPS, AND THE TIGHTER ONE WINS --------------------------------------------
    // Stacked tracks 3 units apart on an 800px canvas: the gap cap allows 3*800/15 = 160,
    // while the body cap allows 32. The body is the tighter, so it is the one that applies.
    g = make([track(10, -2), track(13, -2)], 800);
    g.stackedTrackPitchWorld = () => 3;
    [lo, hi] = g.clampYRangeForTracks(-45, 55);
    ok((hi - lo) === 32, 'the body cap wins when it is tighter: ' + (hi - lo));
    // Tracks 0.1 units apart: the gap cap allows 0.1*800/15 = 5.33, tighter than the body's 32.
    g = make([track(10, -2), track(10.1, -2)], 800);
    g.stackedTrackPitchWorld = () => 0.1;
    [lo, hi] = g.clampYRangeForTracks(-45, 55);
    ok(Math.abs((hi - lo) - (0.1 * 800 / 15)) < 1e-9,
       'and the gap cap wins when IT is tighter: ' + (hi - lo));

    // ---- NOTHING TO PROTECT ---------------------------------------------------------------
    g = make([], 800);
    [lo, hi] = g.clampYRangeForTracks(-45, 55);
    ok(lo === -45 && hi === 55, 'with no tracks at all the view is left alone');
    g = make([track(10, -2)], 0);
    [lo, hi] = g.clampYRangeForTracks(-45, 55);
    ok(lo === -45 && hi === 55, 'and a canvas with no height cannot be reasoned about');

    // ---- EVERY ZOOM-OUT PATH ---------------------------------------------------------------
    ok(/if \(distanceY > 0\) \{ \[nYmin, nYmax\] = this\.clampYRangeForTracks/.test(src),
       'a pinch goes through the clamp');
    ok(/if \(fy >= 1\) \{\s*\n\s*\[ymin1, ymax1\] = this\.clampYRangeForTracks/.test(src),
       'the zoom-out button goes through it');
    ok(/\} else if \(factor > 1\) \{[\s\S]{0,260}clampYRangeForTrackBody/.test(src),
       'and shift+wheel, which drives y deliberately, still cannot flatten a track');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
