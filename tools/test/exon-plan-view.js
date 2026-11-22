// THE PLAN, DRAWN ON THE TRANSCRIPT IT EDITS.
//
//     node tools/test/exon-plan-view.js          (needs jsdom)
//
// "Skip exon 11, induce a 93 nt exon in intron 14" is three facts about a transcript
// nobody is looking at. What makes it judgeable is the shape of the transcript: whether
// those exons are near each other, how much of the message is being thrown away, whether
// the induced exon sits in a huge intron or a tight one.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' }; window.innerWidth = 1430; window.innerHeight = 900;
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const el = () => document.getElementById('baja-exon-plan-view');
const txt = () => (el() || { textContent: '' }).textContent;
const svg = () => (el() ? el().querySelector('svg') : null);
const texts = () => Array.from(svg().querySelectorAll('text')).map((t) => t.textContent);
const rects = () => Array.from(svg().querySelectorAll('rect'));

const roles = (loseN) => [1, 2, 3, 4, 5, 6].map((n) => ({
    n: n, xi: 1000 + (n - 1) * 5000, xf: 1000 + (n - 1) * 5000 + 900,
    role: loseN.indexOf(n) >= 0 ? 'lose' : 'keep', label: loseN.indexOf(n) >= 0 ? ('skip exon ' + n) : '' }));
const RESULT = {
    ok: true, source: { name: 'SOURCE', length: 864 }, target: { name: 'TARGET', exons: 6 },
    baseline: { fit: 0.612, matched: 520, length: 836, roles: roles([]) },
    plans: [
        { edits: [{ kind: 'lose', n: 4, label: 'skip exon 4' },
                  { kind: 'induce', label: 'induce a 93 nt cryptic exon in intron 5' }],
          roles: roles([4]), induced: [{ xi: 22000, xf: 22092, len: 93, intron: 5, score: 0.71 }],
          peptide: 'M', length: 851, matched: 788, fit: 0.921, gain: 0.309, nmd: 'escapes' },
        { edits: [{ kind: 'lose', n: 2, label: 'skip exon 2' }], roles: roles([2]), induced: [],
          peptide: 'M', length: 790, matched: 690, fit: 0.834, gain: 0.222, nmd: 'escapes' }
    ]
};

(async () => {
    const v = await load('baja/bio/splicing/exon-plan-view.js', RESULT);
    ok(!!v && !!el(), 'the window opens');
    ok(/Making TARGET translate like SOURCE/.test(txt()),
       'saying which track is being edited and which is being copied: ' + txt().slice(0, 60));

    // ---- every exon of the target is on the picture, with what becomes of it ------------
    ok([1, 2, 3, 4, 5, 6].every((n) => texts().indexOf('e' + n) >= 0),
       'every exon is drawn: ' + texts().join(','));
    ok(texts().filter((t) => t === 'LOSE').length === 1, 'the one being skipped is marked LOSE');
    ok(svg().querySelectorAll('line').length >= 2,
       'and struck through, since colour alone is not enough for the one role that must not '
       + 'be misread');
    ok(texts().some((t) => /INDUCE 93 nt/.test(t)), 'the induced exon says what it is: ' + texts().join(','));

    // A MARK TOO SMALL TO SEE IS NOT A MARK. A 93 nt exon in a 30 kb transcript is three
    // pixels, and it used to draw as a thinner version of its own connector line.
    const small = rects().filter((r) => /4ade80/.test(r.getAttribute('stroke') || ''));
    ok(small.length === 1 && +small[0].getAttribute('width') >= 10,
       'the induced exon is wide enough to see and point at: '
       + (small[0] && small[0].getAttribute('width')));

    // ---- the fit, before and after -------------------------------------------------------
    ok(/61\.2%/.test(txt()) && /92\.1%/.test(txt()),
       'the fit it starts at and the fit it reaches are both shown: ' + txt().slice(0, 200));
    ok(/twice the identical residues/.test(txt()),
       'with what the number means, since a fit would otherwise be read as an identity');

    // ---- stepping through the plans --------------------------------------------------------
    ok(/Plan 1 of 2/.test(txt()), 'it says which plan is on screen');
    el().querySelector('button[data-id="next"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    ok(/Plan 2 of 2/.test(txt()) && /skip exon 2/.test(txt()), 'Next draws the next one: ' + txt().slice(0, 80));
    const losing = () => Array.from(svg().querySelectorAll('g')).filter((g) =>
        /LOSE/.test(g.textContent)).length;
    ok(losing() >= 1, 'and the marks move with it');
    el().querySelector('button[data-id="prev"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    ok(/Plan 1 of 2/.test(txt()), 'Prev goes back');
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    ok(/Plan 2 of 2/.test(txt()), 'and the arrow keys do the same, which is how they get compared');

    // The ranked list, and picking one from it.
    el().querySelector('button[data-id="plans"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const panel = el().querySelector('[data-id="plans-panel"]');
    ok(panel && panel.style.display === 'block', 'the ranked plans open');
    ok(panel && /skip exon 4/.test(panel.textContent) && /skip exon 2/.test(panel.textContent),
       'with every plan and its edits: ' + (panel ? panel.textContent.slice(0, 120) : ''));
    panel.querySelector('tr[data-plan="0"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    ok(/Plan 1 of 2/.test(txt()), 'and clicking one draws it');

    // ---- what it refuses to open for ------------------------------------------------------
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok(!el(), 'Escape closes it');
    ok(await load('baja/bio/splicing/exon-plan-view.js', { ok: true, plans: [] }) === null,
       'a search that found no plan draws no window: there is nothing to look at');
    ok(await load('baja/bio/splicing/exon-plan-view.js', { ok: false, reason: 'x' }) === null,
       'and neither does a search that did not run');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
