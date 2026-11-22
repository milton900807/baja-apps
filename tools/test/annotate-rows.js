// A NOTES COLUMN, WRITTEN ROW BY ROW FROM WHAT THE CANVAS ACTUALLY HOLDS.
//
//     node tools/test/annotate-rows.js
//
// "add a notes column that describes the formula on each row". The model is stubbed. What
// is tested is what it is TOLD: that each formula has been read and resolved against the
// canvas before it is asked, by address and by tag, so the note can say what the formula
// reads by name. And what is done with its answer: only the notes column is written.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document; window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
let calls = [], answer = null;
const load = async (p, ...a) => {
    if (p === 'py/bio/project/rows-annotate.py') { const sent = JSON.parse(a[1]); calls.push({ what: a[0], sent }); return answer(sent, calls.length); }
    const path = fs.existsSync(p) ? p : p + '.js';
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), pushHistory: () => { }, getIonFunction: () => null, createIonFunction: (f) => f };
let histories = 0;
global.pushHistory = () => { histories++; }; global.HM = () => ({});

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const slug = (x) => ('' + x).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const mkTable = (name, rows, tagged) => {
    const t = { name, formula: {}, wells: [] };
    const cell = (v, c, r, row) => {
        const w = { value: v, setValue(x) { this.value = x; } };
        if (r === 0) { w.skin_type = 'ColumnHeader'; w.group = { ColumnHeader: 1 }; }
        else if (tagged) { w.group = {}; w.group[slug(row[0])] = 1; w.group[slug(rows[0][c])] = 1; }
        return w;
    };
    for (let c = 0; c < rows[0].length; c++) t.wells.push(rows.map((row, r) => cell(row[c], c, r, row)));
    t.formulaTextForWell = (w) => { for (let c = 0; c < t.wells.length; c++) { const r = t.wells[c].indexOf(w); if (r >= 0) { const f = t.formula['[' + c + ':' + c + '][' + r + ':' + r + ']']; return f ? '=' + f : null; } } return null; };
    t.addColumn = (h) => { histories++; const col = t.wells[0].map((_, r) => cell(r === 0 ? h : '', t.wells.length, r, ['x'])); for (const w of col.slice(1)) delete w.group; t.wells.push(col); };
    t.fitted = 0; t.fitRowsAndColumns = () => { t.fitted++; };
    return t;
};
const mk = () => {
    const a = mkTable('assumptions', [['title', 'value'], ['Annual Insurance', '12000'], ['Malt Annual Cost', '60000'], ['Hops Annual Cost', '35000']], true);
    const p = mkTable('pnl', [['Item', 'Value'], ['Insurance per month', '1000'], ['Raw materials', '95000'], ['Target margin', '0.4'], ['Mystery', '7'], ['', '']], true);
    p.formula['[1:1][1:1]'] = 'assumptions[Annual_Insurance,value]/12';
    p.formula['[1:1][2:2]'] = 'assumptions[1:1][2:2]+assumptions[1:1][3:3]';
    p.formula['[1:1][4:4]'] = 'assumptions[Water,value]*2';
    const pt = { root: [p, a], selectedPlate: p, said: [], wakes: 0, setMessage(m) { this.said.push('' + m); }, wake() { this.wakes++; },
        getTableByName: (n) => [p, a].filter((x) => x.name === n)[0] || null };
    return { a, p, pt };
};
const col = (t, c) => t.wells[c].map((w) => (w.value == null ? '' : '' + w.value));
const noteAll = (sent) => ({ status: 'OK', notes: Object.fromEntries(sent.rows.map((r) => ['' + r.row, 'note for ' + r.label])) });

(async () => {
    // ---- a column is added and every row is written about ------------------------------------
    let x = mk(); calls = []; answer = noteAll; histories = 0;
    let r = await load('baja/plate/ops/annotate-rows.js', x.pt, { table: 'pnl' });
    ok(!r.error && r.added_column === true && x.p.wells.length === 3 && col(x.p, 2)[0] === 'Notes', 'a Notes column is added to the table: ' + JSON.stringify(col(x.p, 2).slice(0, 2)));
    ok(col(x.p, 2).slice(1, 5).join('|') === 'note for Insurance per month|note for Raw materials|note for Target margin|note for Mystery',
       'and a note is written on each row: ' + col(x.p, 2).slice(1, 5).join(' | '));
    ok(col(x.p, 2)[5] === '', 'a row with nothing in it is not written about');
    ok(col(x.p, 0).join('|') === 'Item|Insurance per month|Raw materials|Target margin|Mystery|' && col(x.p, 1)[1] === '1000' && col(x.a, 1)[1] === '12000',
       'nothing but the notes column is touched, in this table or any other');
    ok(histories === 1, 'one undo covers the column and its notes: ' + histories);
    ok(/Added a Notes column to pnl and wrote 4 notes/.test(x.pt.said[x.pt.said.length - 1]), 'and it says what it did: ' + x.pt.said[x.pt.said.length - 1].slice(0, 70));

    // ---- what the model is told: each formula, already read off the canvas --------------------
    const sent = calls[0].sent;
    const ins = sent.rows[0].cells.filter((c) => c.formula)[0];
    ok(sent.rows[0].label === 'Insurance per month' && ins.formula === '=assumptions[Annual_Insurance,value]/12' && ins.value === '1000',
       'the row goes with its label, its value and its formula');
    ok(ins.reads.length === 1 && ins.reads[0].table === 'assumptions' && ins.reads[0].names.join() === 'Annual Insurance / value' && ins.reads[0].values.join() === '12000',
       'a TAG reference is resolved to what it reads, by name, with the number there: ' + JSON.stringify(ins.reads[0]));
    const raw = sent.rows[1].cells.filter((c) => c.formula)[0];
    ok(raw.reads.length === 2 && raw.reads[0].names.join() === 'Malt Annual Cost / value' && raw.reads[1].names.join() === 'Hops Annual Cost / value' && raw.reads[1].values.join() === '35000',
       'an ADDRESS reference is resolved the same way: ' + raw.reads.map((q) => q.names[0]).join(' + '));
    const bad = sent.rows[3].cells.filter((c) => c.formula)[0];
    ok(/no cell in assumptions is tagged Water and value/.test(bad.reads[0].unresolved || ''), 'a reference that lands on nothing is sent as unresolved, so the note can say so: ' + bad.reads[0].unresolved);
    ok(sent.rows[0].tags.indexOf('Insurance_per_month') >= 0 && sent.rows[0].tags.indexOf('ColumnHeader') < 0, 'the row’s own tags go too: ' + sent.rows[0].tags.join());
    ok(sent.rows[2].cells.every((c) => !c.formula) && sent.rows[2].used_by === undefined, 'a row with no formula is sent as an input');
    ok(sent.other_tables.length === 1 && sent.other_tables[0].table === 'assumptions' && sent.headings.join() === 'Item,Value', 'with the rest of the canvas named, and the notes column itself left out of the headings');

    // inputs are told what depends on them
    x = mk(); calls = []; answer = noteAll;
    await load('baja/plate/ops/annotate-rows.js', x.pt, { table: 'assumptions' });
    const rows2 = calls[0].sent.rows;
    ok(rows2[0].used_by && rows2[0].used_by.join() === 'pnl: Insurance per month' && rows2[1].used_by.join() === 'pnl: Raw materials',
       'an input row is told which rows elsewhere read it, by tag or by address: ' + JSON.stringify(rows2.map((q) => q.used_by)));

    // ---- row by row, in groups, with progress -------------------------------------------------
    x = mk(); calls = [];
    const big = mkTable('big', [['Item', 'Value']].concat(Array.from({ length: 30 }, (_, i) => ['thing ' + i, '' + i])), true);
    x.pt.root.push(big);
    const steps = []; window.__bajaWorking = { step: (m) => steps.push(m) };
    answer = noteAll;
    r = await load('baja/plate/ops/annotate-rows.js', x.pt, { plate: big });
    ok(calls.length === 3 && calls[0].sent.rows.length === 12 && calls[2].sent.rows.length === 6, 'thirty rows are gone through in groups, not in one request: ' + calls.map((c) => c.sent.rows.length).join(','));
    ok(steps.length === 3 && /rows 13 to 24 of 30, 12 written/.test(steps[1]), 'and the panel says how far it has got: ' + steps[1]);
    ok(r.notes === 30 && big.fitted === 1, 'all thirty are written and the table is refitted for the new text');

    // one group failing does not lose the others
    x = mk(); calls = [];
    const big2 = mkTable('big2', [['Item', 'Value']].concat(Array.from({ length: 30 }, (_, i) => ['thing ' + i, '' + i])), true);
    x.pt.root.push(big2);
    answer = (s2, n) => (n === 2 ? { status: 'ERROR', error: 'timed out' } : noteAll(s2));
    r = await load('baja/plate/ops/annotate-rows.js', x.pt, { plate: big2 });
    ok(r.notes === 18 && r.failed_groups === 1 && col(big2, 2)[1] === 'note for thing 0' && col(big2, 2)[13] === '' && col(big2, 2)[25] === 'note for thing 24',
       'a group that fails leaves its rows blank and the rest written: ' + r.notes + ' notes');
    ok(/1 group of rows could not be done \(timed out\); ask again/.test(x.pt.said[x.pt.said.length - 1]), 'and says so, with what to do');
    delete window.__bajaWorking;

    // ---- an existing notes column, and notes already in it -----------------------------------
    x = mk(); calls = []; answer = noteAll;
    await load('baja/plate/ops/annotate-rows.js', x.pt, { table: 'pnl' });
    x.p.wells[2][1].value = 'my own note'; x.p.wells[2][2].value = '';
    calls = [];
    r = await load('baja/plate/ops/annotate-rows.js', x.pt, { table: 'pnl' });
    ok(x.p.wells.length === 3 && !r.added_column, 'asked again, the Notes column that is there is used, not a second one added');
    ok(calls[0].sent.rows.length === 1 && calls[0].sent.rows[0].label === 'Raw materials' && col(x.p, 2)[1] === 'my own note' && r.kept === 3,
       'notes already written are kept, and only the empty one is asked about');
    calls = [];
    r = await load('baja/plate/ops/annotate-rows.js', x.pt, { table: 'pnl', overwrite: 'yes' });
    ok(calls[0].sent.rows.length === 4 && col(x.p, 2)[1] === 'note for Insurance per month', 'unless the request says to rewrite them');
    calls = [];
    r = await load('baja/plate/ops/annotate-rows.js', x.pt, { table: 'pnl' });
    ok(/already has a note/.test(r.error) && !calls.length, 'with every row noted and nothing to rewrite, nothing is asked: ' + r.error.slice(0, 60));

    // ---- what comes back is only ever a note --------------------------------------------------
    x = mk(); calls = [];
    answer = (s2) => ({ status: 'OK', notes: { '1': '=assumptions[1:1][1:1]*99', '2': '  spread\n over  lines ', '9': 'a row that was not sent', '3': '' } });
    r = await load('baja/plate/ops/annotate-rows.js', x.pt, { table: 'pnl', column: 'Comments', what: 'for an investor' });
    ok(col(x.p, 2)[0] === 'Comments' && calls[0].what === 'for an investor', 'the heading and the emphasis asked for are used');
    ok(col(x.p, 2)[1] === 'assumptions[1:1][1:1]*99', 'a note that came back looking like a formula is written as text, never as a formula: ' + col(x.p, 2)[1]);
    ok(col(x.p, 2)[2] === 'spread over lines' && col(x.p, 2)[3] === '' && r.blank === 2, 'a note is one line, and a row with none is left blank and counted');

    // ---- the sentence itself, through the card: no menu search, straight to the rows ---------
    {
        let menuAsked = 0;
        const realLoad = global.lion_engine.exec;
        global.lion_engine.exec = (p2, ...a2) => (p2 === 'py/bio/project/menu-pick.py' ? (menuAsked++, { status: 'OK' }) : load(p2, ...a2));
        const viaCard = async (x2, text) => {
            document.body.innerHTML = ''; calls = []; menuAsked = 0;
            const src = fs.readFileSync('baja/plate/menu/project-command.js', 'utf8');
            const f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(global.lion_engine.exec, {});
            await f({ menus: [{ label: 'Draw', items: [{ label: 'Table', click: () => { } }] }], pm: x2.pt, text, context: {}, setError: () => { } });
            await new Promise((res) => setTimeout(res, 40));
        };
        x = mk(); answer = noteAll;
        await viaCard(x, 'add a notes collumn  that describes the formula on each row');
        ok(x.p.wells.length === 3 && col(x.p, 2)[0] === 'Notes' && col(x.p, 2)[1] === 'note for Insurance per month' && menuAsked === 0,
           'the sentence as it was typed, misspelling and all, adds the column and writes the notes with no menu search');
        ok(calls[0].what === 'add a notes collumn  that describes the formula on each row', 'and the request itself is passed on, for any emphasis in it');
        x = mk(); answer = noteAll;
        await viaCard(x, 'add a comments column explaining each row for an investor');
        ok(col(x.p, 2)[0] === 'Comments' && col(x.p, 2)[2] === 'note for Raw materials', 'a comments column that explains is the same request, under its own heading');
        x = mk(); answer = noteAll;
        await viaCard(x, 'add a notes column');
        ok(x.p.wells.length === 2 && !calls.length && menuAsked === 1, 'a bare "add a notes column" says nothing about describing, and is left to the usual search');
        global.lion_engine.exec = realLoad;
    }

    // ---- the catalogue, the card, the python --------------------------------------------------
    const cap = await load('baja/plate/menu/project-capabilities.js');
    ok(cap.catalogue().map((c) => c.name).indexOf('annotate_rows') >= 0, 'annotate_rows is offered to the planner');
    ok(cap.preview('annotate_rows', { table: 'pnl' }) === 'add a Notes column to "pnl" and write a note on each row', 'and its card says what it will do');
    const caps = fs.readFileSync('baja/plate/menu/project-capabilities.js', 'utf8').replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ');
    ok(/add a notes column that describes the formula on each row/.test(caps), 'under the sentence it was asked with');
    const py = fs.readFileSync('py/bio/project/rows-annotate.py', 'utf8');
    ok(/WRITE FROM THIS/.test(py) && /if k not in rows:\s*\n\s*continue/.test(py) && /while s\.startswith\("="\)/.test(py), 'the python writes from what the formula reads, drops rows it was not sent, and never returns a formula');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
