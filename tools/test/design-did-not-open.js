// A DESIGN THAT WILL NOT OPEN HAS TO SAY SO.
//
//     node tools/test/design-did-not-open.js
//
// Opening a saved .baja that the editor could not restore gave an empty canvas and
// nothing else: the whole restore sat under `catch (exception) { }`. A truncated file, a
// layer type that no longer exists, one bad track -- all of them looked exactly like a
// design with nothing in it, so the first move available to anyone was to guess.
//
// The two cases read differently and the message has to tell them apart, because the
// answer is different. A file CUT OFF is a save that did not finish, and the way back is
// an earlier copy. A file that is whole is the restore failing on something inside it,
// and the way back is the console.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

// The handler, lifted from editor.js so this exercises what ships.
const src = fs.readFileSync('manchester/editor.js', 'utf8');
const body = src.slice(src.indexOf('// THIS DESIGN DID NOT OPEN, AND WHY.'),
    src.indexOf("else if (isTranscriptId(s.trim().split(/\\s+/)[0])) {"));
const handler = new Function('exception', 's', 'graph', 'console',
    body.slice(0, body.lastIndexOf('} catch (e2) { }')) + '} catch (e2) { }');

const run = (exception, s) => {
    const said = [];
    handler(exception, s, { setError: (m) => said.push(m) }, { error() { } });
    return said.join(' ');
};

(() => {
    // ---- A SAVE THAT DID NOT FINISH -------------------------------------------------------
    const cut = '{"viewport":{"track":[{"name":"DNM1","sequence":"ACGT';
    let m = run(new SyntaxError('Unexpected end of JSON input'), cut);
    ok(/did not open/.test(m), 'a truncated design says it did not open: ' + m.slice(0, 48));
    ok(/Unexpected end of JSON input/.test(m), 'with the error itself in it');
    ok(/looks cut off/.test(m), 'named as cut off rather than wrong');
    ok(/did not finish/.test(m), 'and pinned on the save that wrote it');
    ok(/earlier copy/.test(m), 'with the one thing that actually recovers it');
    ok(m.indexOf('' + cut.length) >= 0 || /\d/.test(m), 'and how big the file it got was');

    // A file whose JSON is valid but that ends somewhere other than a closing brace is the
    // same story: parse is not the only way a half-written file shows up.
    m = run(new TypeError("Cannot read properties of undefined (reading 'track')"),
        '{"viewport":{"track":[]}} trailing junk');
    ok(/looks cut off/.test(m), 'so is a file that does not end where a whole one would');

    // ---- A WHOLE FILE THAT THE RESTORE CHOKED ON --------------------------------------------
    // Saying "cut off" here would send someone looking for a backup they do not need.
    m = run(new TypeError("Cannot read properties of undefined (reading 'xi')"),
        '{"viewport":{"track":[{"name":"DNM1"}]}}');
    ok(/did not open/.test(m), 'a complete file that fails to restore also says so');
    ok(!/cut off/.test(m), 'and is NOT called cut off: ' + m.slice(0, 60));
    ok(/The file is complete/.test(m), 'it is named as complete');
    ok(/restore failing on something inside it/.test(m),
       'with the failure put where it belongs');
    ok(/console/.test(m), 'and points at where the whole error is');

    // ---- IT NEVER TAKES THE LOAD DOWN WITH IT -------------------------------------------------
    // This runs while an open has already failed; a throw here would replace a design that
    // did not open with a page that did not load.
    let threw = false;
    try { handler(null, null, null, null); } catch (e) { threw = true; }
    ok(!threw, 'a graph with no setError, and no file at all, is survivable');

    ok(!/catch \(exception\) \{\s*\n\s*\}/.test(src), 'and the empty catch is gone from editor.js');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
