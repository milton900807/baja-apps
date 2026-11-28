// A TRACK THAT DRAWS NOTHING AND SAYS NOTHING.
//
//     node tools/test/track-body-coordinate-guard.js
//
// A design opened with its tracks as title bars over empty strips: the header painted,
// the body not, and nothing anywhere saying why. The body draw began by asking whether
// the world coordinate at the left edge of the canvas is TRUTHY, and returned from the
// whole track if it was not.
//
// Two unrelated things are falsy there. ZERO is an ordinary place for a view to start,
// and a track whose left edge sits at world 0 vanished for no reason at all. NaN is a
// real fault -- it is what a grid that restored only part way hands back -- and it was
// treated identically, so the fault that deserved a sentence got the same silence as the
// case that deserved to draw.
//
// Both copies of the arithmetic have the same test, in both Track classes: the one that
// draws the body and the one that answers whether the pointer is on the track. A view at
// world 0 made the second one say "not on me" to every press.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const T = fs.readFileSync('baja/bio/track.js', 'utf8');
const F = fs.readFileSync('baja/bio/track-flexi.js', 'utf8');

(() => {
    // ---- THE TEST ITSELF, as both classes now make it --------------------------------------
    const guard = (gwcxs) => !isFinite(gwcxs);
    ok(guard(NaN) === true, 'a coordinate that is not a number stops the body');
    ok(guard(undefined) === true, 'and so does one the grid never gave');
    ok(guard(0) === false, 'but world zero draws, which is the whole of the bug');
    ok(guard(-128254715) === false, 'as does a negative one');
    ok(guard(128254715) === false, 'and an ordinary genomic coordinate');

    // ---- IN BOTH COPIES, IN BOTH CLASSES -----------------------------------------------------
    // BOTH ENDS, EVERY COPY. The left edge was not the only one tested this way: the
    // coordinate at the RIGHT edge had the same test beside it every time, so fixing only
    // the one that was noticed would have left the same track blank at the same views.
    ok(!/!gwcxs\b/.test(T) && !/!gwcxf\b/.test(T),
       'no falsy test on a coordinate is left in track.js');
    ok(!/!gwcxs\b/.test(F) && !/!gwcxf\b/.test(F),
       'nor in track-flexi.js, which is the other Track class');
    ok((T.match(/!isFinite\(gwcx[sf]\)/g) || []).length === 6,
       'all six of track.js own copies were fixed: ' + ((T.match(/!isFinite\(gwcx[sf]\)/g) || []).length));
    ok((F.match(/!isFinite\(gwcx[sf]\)/g) || []).length === 4,
       'and all four in track-flexi.js: ' + ((F.match(/!isFinite\(gwcx[sf]\)/g) || []).length));

    // ---- AND IT SAYS SO ------------------------------------------------------------------------
    // The silence is the reason this took a morning to find: a blank track is what a
    // broken file, a missing sequence and a bad view all look like.
    const body = T.slice(T.indexOf('A TRACK THAT DRAWS NOTHING AND SAYS NOTHING'),
        T.indexOf('A TRACK THAT DRAWS NOTHING AND SAYS NOTHING') + 2200);
    ok(/setError/.test(body), 'the body draw says something when it refuses');
    ok(/has a title but no body/.test(body), 'naming what is on screen, which is what is asked about');
    ok(/__noCoordSaid/.test(body), 'once per track, not once per frame');
    ok(/restored only part way/.test(body), 'and what that usually means');
    ok(/Reloading the file/.test(body), 'with something to actually do about it');

    // The hit test stays quiet: -1 there means "the pointer is not on this track", which is
    // answered thousands of times a second and is not a fault.
    const hit = T.slice(T.indexOf('if (!isFinite(gwcxs)) return -1;') - 200,
        T.indexOf('if (!isFinite(gwcxs)) return -1;') + 60);
    ok(!/setError/.test(hit), 'the hit test says nothing, since it runs on every mouse move');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
