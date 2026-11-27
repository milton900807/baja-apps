// CHOOSING MANY AT ONCE from the picker.
//
//     node tools/test/pick-list-multi.js          (needs jsdom)
//
// The single-pick list reports and closes, which is right for "which track". It is wrong
// for "which of these forty variants": picking them one at a time is the work the picker
// exists to avoid. Multi mode must therefore do three things the single one must not --
// hold a set, leave the list open while it fills, and fire ONCE at the end. A picker that
// fired per tick would start the job once per variant.
const fs = require('fs');
const { JSDOM } = require('jsdom');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: "" };
global.focusUnlessMobile = () => { };

const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

const pane = () => document.getElementById('baja-pick-list');
const rowsOf = () => Array.from(pane().querySelectorAll('div'))
    .filter((d) => d.firstElementChild && d.firstElementChild.hasAttribute
        && d.firstElementChild.hasAttribute('data-box'));
const btn = (t) => Array.from(pane().querySelectorAll('button')).filter((b) => b.textContent === t)[0];

(async () => {
    const items = [
        { label: 'A315T', sub: 'Pathogenic', ref: 'A315T' },
        { label: 'M337V', sub: 'Pathogenic', ref: 'M337V' },
        { label: 'N352S', sub: 'Conflicting', ref: 'N352S' }
    ];
    let got = null, closed = 0;
    await load('baja/lib/pick-list.js', {
        title: 'Variants', items: items, multi: true,
        onPick: (list) => { got = list; }, onClose: () => { closed++; }
    });
    ok(!!pane(), 'the list opens');
    const rows = rowsOf();
    ok(rows.length === 3, 'a checkbox per item: ' + rows.length);

    rows[0].onclick(); rows[2].onclick();
    ok(got === null, 'nothing is reported while the set is being built');
    ok(!!pane(), 'and the list stays open');
    ok(/2 chosen/.test(pane().textContent), 'it says how many are chosen');
    rows[2].onclick();
    ok(/1 chosen/.test(pane().textContent), 'a second press takes one back off');

    // Filter then select-all is the narrowing people actually do: type Pathogenic, take
    // the lot. Select-all must therefore mean the rows SHOWN, not every row there is.
    btn('Clear').onclick();
    const search = pane().querySelector('input');
    search.value = 'pathogenic'; search.oninput();
    btn('Select all shown').onclick();
    ok(/2 chosen/.test(pane().textContent),
       'select-all takes the filtered rows, not all of them: ' + pane().textContent.match(/\d+ chosen|none chosen yet/));

    btn('Done').onclick();
    ok(Array.isArray(got) && got.length === 2, 'Done reports an array, once: ' + (got && got.length));
    ok(got.map((x) => x.ref).join(',') === 'A315T,M337V', 'holding what was chosen: '
       + got.map((x) => x.ref).join(','));
    ok(!pane(), 'and the list closes');
    ok(closed === 0, 'a finished pick is not also a dismissal');

    // Dismissal is still an answer, so a caller awaiting a set is never left hanging.
    let got2 = null, closed2 = 0;
    await load('baja/lib/pick-list.js', {
        title: 'Variants', items: items, multi: true,
        onPick: (l) => { got2 = l; }, onClose: () => { closed2++; }
    });
    btn('✕ Close').onclick();
    ok(closed2 === 1 && got2 === null, 'closing with nothing chosen reports the dismissal');

    // The single-pick list is untouched: it still reports one item and closes.
    let one = null;
    await load('baja/lib/pick-list.js', {
        title: 'Tracks', items: items, onPick: (it) => { one = it; }
    });
    ok(pane().querySelectorAll('[data-box]').length === 0, 'single mode has no checkboxes');
    Array.from(pane().querySelectorAll('div')).filter((d) => d.onclick)[0].onclick();
    ok(one && one.ref === 'A315T', 'and still reports the one item: ' + (one && one.ref));

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
