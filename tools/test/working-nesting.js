// AN OPERATION THAT CALLS ANOTHER OPERATION KEEPS ITS OWN PANEL.
//
//     node tools/test/working-nesting.js          (needs jsdom)
//
// The panel was a singleton that DESTROYED whatever was up before it. Fine for two
// unrelated operations, wrong for the ordinary case: the exon comparison raises a panel,
// reports each exon as it searches, then runs PSI -- which raises a panel of its own, kills
// the comparison's node, and on finishing takes itself away. The comparison then ran on for
// another minute writing step() into a node that was no longer in the document. On screen
// that is feedback that stops dead partway through, which is what "it went quiet after the
// PSI ran" was.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const src = fs.readFileSync(p, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), createIonFunction: (f) => f, getIonFunction: (r) => r };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const panels = () => Array.from(document.querySelectorAll('#baja-working'));
const shown = () => panels().filter((p) => p.style.display !== 'none');
const text = () => (shown()[0] || { textContent: '' }).textContent;
const W = (t, d) => load('baja/lib/working.js', t, d);

(async () => {
    // The comparison's panel, reporting progress.
    const outer = await W('Exons of QUERY against TARGET', 'One search per exon.');
    outer.step('Searching exon 7 of 22');
    ok(shown().length === 1 && /Searching exon 7 of 22/.test(text()), 'the outer operation reports progress');

    // PSI, started from inside it.
    const inner = await W('Running PSI on QUERY', 'splice model');
    ok(shown().length === 1, 'one panel is on screen at a time, not two stacked');
    ok(/Running PSI on QUERY/.test(text()), 'and it is the inner one: ' + text().slice(0, 60));
    ok(panels().length === 2, 'the outer one is kept, hidden, rather than destroyed');
    ok(window.__bajaWorking === inner, 'the inner one is what another operation would see');

    // The outer operation is still running and still being told things.
    outer.step('Searching exon 8 of 22');

    inner.done();
    ok(shown().length === 1, 'when PSI finishes its panel goes');
    ok(/Exons of QUERY against TARGET/.test(text()),
       'AND THE COMPARISON IS BACK, not a bare canvas: ' + text().slice(0, 60));
    ok(/Searching exon 8 of 22/.test(text()),
       'carrying what it was told while it was underneath: ' + text().slice(0, 90));
    ok(window.__bajaWorking === outer, 'and it owns the screen again');

    // Three deep, since a capability can call a capability that calls one.
    const mid = await W('Mid', '');
    const deep = await W('Deep', '');
    ok(shown().length === 1 && /Deep/.test(text()), 'three deep shows the innermost');
    deep.done();
    ok(/Mid/.test(text()), 'unwinding one level shows the middle one');
    mid.done();
    ok(/Exons of QUERY against TARGET/.test(text()), 'and the next shows the outermost again');

    // A step after something removed the panel brings it back: an operation still
    // reporting progress is still running.
    const node = shown()[0];
    node.parentNode.removeChild(node);
    outer.step('Searching exon 9 of 22');
    ok(shown().length === 1 && /Searching exon 9 of 22/.test(text()),
       'a panel taken away by something else comes back on the next word');

    outer.done();
    ok(panels().length === 0 && !window.__bajaWorking, 'and the last one leaves nothing behind');

    // A FAILURE STAYS UP, over the operation that is still running, until it is read.
    const o2 = await W('Outer two', '');
    const i2 = await W('Inner two', '');
    i2.fail('the splice model returned nothing');
    ok(/the splice model returned nothing/.test(text()), 'a nested failure is shown');
    const close = shown()[0].querySelector('button[data-id="close"]');
    close.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    ok(/Outer two/.test(text()) && window.__bajaWorking === o2,
       'and closing it returns to the operation underneath: ' + text().slice(0, 40));
    o2.done();

    // Two UNRELATED operations: nothing is kept under, so the old behaviour stands.
    const a = await W('A', '');
    a.done();
    const b = await W('B', '');
    ok(shown().length === 1 && /B/.test(text()), 'an unrelated later operation just shows itself');
    b.done();
    ok(panels().length === 0, 'with nothing left over');

    // ---- the caller that was losing its panel -------------------------------------------
    const mr = fs.readFileSync('baja/bio/match-regions.js', 'utf8');
    ok(/Exon stability: ' \+ na \+ ' scored on '/.test(mr),
       'the comparison says what the PSI run produced before the picture replaces the panel');
    ok(/if \(psiTried\) \{ if \(graph\.rescale\) graph\.rescale\(\); if \(graph\.wake\) graph\.wake\(\); \}/.test(mr),
       'and redraws the track behind it, which was holding a layer added under the panel');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
