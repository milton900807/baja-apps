// A BOOKMARK THAT FRAMES A TABLE, BY NAME.
//
//     node tools/test/bookmark-tables.js
//
// "bookmark assumptions" in the command field threw "Invalid formula: bookmark assumptions.
// Expected TableName[groups]" into the console and did nothing on screen.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document; window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
let menuAsked = 0;
const load = async (p, ...a) => {
    if (p === 'py/bio/project/menu-pick.py') { menuAsked++; return { status: 'OK' }; }
    const path = fs.existsSync(p) ? p : p + '.js';
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), getIonFunction: () => null, createIonFunction: (f) => f };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const mk = () => {
        const a = { name: 'assumptions', wells: [[{}]] }, f = { name: 'flight_cost', wells: [[{}]] }, n = { name: 'annual', wells: [[{}]] };
        const pt = { root: [a, f, n], selectedPlate: null, bookmarks: {}, said: [], made: [],
            setMessage(m) { this.said.push('' + m); }, wake() { },
            bookmarkObjects(name, objects) { this.made.push({ name, tables: objects.map((x) => x.name) }); this.bookmarks[name] = {}; return {}; } };
        return pt;
    };
    const run = (pt, o) => load('baja/plate/ops/bookmark-tables.js', pt, o);

    let pt = mk();
    let r = await run(pt, { tables: 'assumptions' });
    ok(!r.error && pt.made.length === 1 && pt.made[0].name === 'assumptions' && pt.made[0].tables.join() === 'assumptions',
       'the table is framed under its own name: ' + JSON.stringify(pt.made));
    ok(/Bookmarked assumptions/.test(pt.said.join(' ')) && /under Bookmarks/.test(pt.said.join(' ')), 'and it says so, and where to find it');

    pt = mk();
    r = await run(pt, { tables: 'assumptionss' });
    ok(!r.error && pt.made[0].tables.join() === 'assumptions' && /read as assumptions/.test(pt.said.join(' ')),
       'a name one letter out is taken as the table it means, and that is said: ' + pt.said.join(' | '));

    pt = mk();
    r = await run(pt, { tables: 'the assumptions and flight cost tables', name: 'costs' });
    ok(pt.made[0].name === 'costs' && pt.made[0].tables.join() === 'assumptions,flight_cost', 'several tables under a given name: ' + JSON.stringify(pt.made));

    pt = mk();
    r = await run(pt, { tables: 'payroll' });
    ok(/no table called .payroll./.test(r.error) && /assumptions, flight_cost, annual/.test(r.error) && !pt.made.length,
       'a name that is nothing like a table is not guessed at: ' + r.error);

    pt = mk(); pt.selectedPlate = pt.root[2];
    r = await run(pt, {});
    ok(pt.made[0].tables.join() === 'annual', 'with no name given it is the selected table');
    pt = mk();
    r = await run(pt, {});
    ok(/say which table/.test(r.error), 'and with nothing selected it asks: ' + r.error);

    pt = mk(); pt.bookmarks['assumptions'] = {};
    r = await run(pt, { tables: 'assumptions' });
    ok(r.replaced === true && /replacing the bookmark/.test(pt.said.join(' ')), 'a bookmark of the same name is replaced, and that is said');

    // ---- through the card: no model, no confirmation ----------------------------------------
    const card = async (pt2, text) => {
        document.body.innerHTML = ''; menuAsked = 0;
        await load('baja/plate/menu/project-command.js', { menus: [{ label: 'Draw', items: [{ label: 'Table', click: () => { } }] }],
            pm: pt2, text: text, context: {}, setError: () => { } });
        await sleep(30);
    };
    pt = mk();
    await card(pt, 'bookmark assumptions');
    ok(pt.made.length === 1 && pt.made[0].tables.join() === 'assumptions' && menuAsked === 0,
       '"bookmark assumptions" is done at once, with no model asked');
    pt = mk();
    await card(pt, 'bookmark assumptions and annual as inputs');
    ok(pt.made[0].name === 'inputs' && pt.made[0].tables.join() === 'assumptions,annual', '"... as inputs" names it: ' + JSON.stringify(pt.made));
    pt = mk();
    await card(pt, 'bookmark payroll');
    ok(/That did not happen/.test(document.body.textContent) && /no table called/.test(document.body.textContent), 'a table that is not there is said on the card');

    // ---- the field: a rejected formula is caught, and plain words get a second reading ------
    const nav = fs.readFileSync('manchester/controls/navigation-panel-plates2.js', 'utf8');
    ok(/return pt\.createPlateFromFormula\(str\)/.test(nav), 'the formula engine’s promise is returned, so its failure can be caught');
    const k = nav.indexOf('if (!looksLikeASentence(t)) {');
    const part = nav.slice(k, k + 900);
    ok(k > 0 && /try \{ await legacy\(t, panel\); \} catch \(e\) \{ failed =/.test(part), 'and it is caught');
    ok(/if \(!plainWords\) \{ try \{ pt\.setMessage\(failed, 10\)/.test(part), 'a real formula that fails is shown as its error');
    // the predicate itself, lifted out and run
    const expr = /const plainWords = ([\s\S]*?);\n/.exec(part)[1];
    const plain = (t) => new Function('t', 'return (' + expr + ')')(t);
    ok(plain('bookmark assumptions') && plain('bookmark assumptionss'), 'two plain words are read again as a request');
    ok(!plain('plate[A1:B2]') && !plain('=sum(a[1:1][1:2])') && !plain('assumptions') && !plain('table 2'),
       'anything with formula punctuation, a digit, or a single word is not');

    const cap = await load('baja/plate/menu/project-capabilities.js');
    ok(cap.catalogue().map((c) => c.name).indexOf('bookmark_tables') >= 0
       && cap.preview('bookmark_tables', { tables: 'assumptions' }) === 'bookmark "assumptions"', 'and the planner is offered it too');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
