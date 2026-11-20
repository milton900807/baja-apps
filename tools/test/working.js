// SOMETHING IS HAPPENING, AND HERE IS WHAT.
//
//     node tools/test/working.js
//
// "there is no feedback ... show better user feedback that it is running". A lookup that
// takes forty seconds and says nothing is indistinguishable from one that never started,
// and the honest reading of that screen is "nothing happened" -- followed by a second
// press that starts the whole thing again.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'https://gene.clinic/', pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
global.navigator = dom.window.navigator;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const src = fs.readFileSync(path, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

(async () => {
    const w = await load('baja/lib/working.js', 'Conservation map for SPAG9',
        'Asking Ensembl for the alignments.');
    const el = document.getElementById('baja-working');
    ok(!!el, 'a panel appears while the work runs');
    ok(/inset:\s*0/.test(el.style.cssText),
       'over the canvas, which is not usable meanwhile and whose buttons would otherwise '
       + 'take a second press');
    ok(/Conservation map for SPAG9/.test(el.textContent), 'saying what is running');
    ok(/Asking Ensembl/.test(el.textContent), 'and what it is waiting on');
    ok(!!el.querySelector('svg animateTransform'), 'with something that moves');

    // THE CLOCK IS THE POINT: a spinner says wait, a count says how long you have waited,
    // which is what decides whether to keep waiting.
    ok(/0 seconds/.test(el.textContent), 'and a clock, from the first moment: '
       + (/\d+ seconds?/.exec(el.textContent) || [''])[0]);

    w.step('Stacking 6 species across 1,321 residues …');
    ok(/Stacking 6 species/.test(el.textContent),
       'the detail changes as the work moves on: ' + el.textContent.slice(-60));

    w.done();
    ok(!document.getElementById('baja-working'), 'and it goes when the work does');

    // A failure stays up until it is read. A corner message on a timer does not.
    const w2 = await load('baja/lib/working.js', 'Homologs of TP53', 'Asking Ensembl.');
    w2.fail('Ensembl refused the request: unknown species');
    const el2 = document.getElementById('baja-working');
    ok(!!el2 && /unknown species/.test(el2.textContent),
       'a failure is shown in the panel: ' + el2.textContent.slice(-50));
    ok(!el2.querySelector('svg'), 'the spinner stops, since nothing is spinning any more');
    const close = el2.querySelector('button[data-id="close"]');
    ok(!!close, 'and it waits to be dismissed rather than vanishing on a timer');
    close.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    ok(!document.getElementById('baja-working'), 'Close puts it away');

    // Only one at a time: a second slow thing replaces the first rather than stacking.
    await load('baja/lib/working.js', 'One', 'a');
    await load('baja/lib/working.js', 'Two', 'b');
    ok(document.querySelectorAll('#baja-working').length === 1,
       'one panel at a time: ' + document.querySelectorAll('#baja-working').length);
    ok(/Two/.test(document.getElementById('baja-working').textContent), 'the newest one');
    try { window.__bajaWorking.done(); } catch (e) { }

    // Escape gives up WAITING, not the work: there is no handle to stop the work, and
    // pretending there is would be worse than leaving it running.
    const w3 = await load('baja/lib/working.js', 'Three', 'c');
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok(!document.getElementById('baja-working'), 'Escape dismisses the panel');
    w3.done();

    // ---- the slow paths use it --------------------------------------------------------
    for (const [file, what] of [
        ['baja/manchester/menu/editor-capabilities.js', 'the conservation map and the homolog list'],
        ['baja/bio/homologs-screen.js', 'the map reached from the list'],
        ['baja/bio/match-regions.js', 'the exon matcher, which is one search per region']]) {
        const src = fs.readFileSync(file, 'utf8');
        ok(/baja\/lib\/working\.js/.test(src), what + ' shows it');
        ok(/\.fail\(/.test(src), 'and turns it into the failure rather than leaving it spinning');
    }
    const mr = fs.readFileSync('baja/bio/match-regions.js', 'utf8');
    ok(/matched so far/.test(mr),
       'the exon matcher counts out loud, since thirty searches look like a dead job');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
