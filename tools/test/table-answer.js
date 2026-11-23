// A QUESTION ABOUT A TABLE IS ANSWERED, FROM THE CANVAS.
//
//     node tools/test/table-answer.js        (needs jsdom)
//
// "how many kegs does this create", asked of the assumptions table, came back "Nothing here
// does that". A question now goes to an answerer that reads the tables and replies with its
// working. The model is stubbed: what is tested is what is sent to it, what is done with what
// it says (every cited cell found again, the arithmetic redone), what the card shows, and
// how the card is laid out on a phone.
const fs = require('fs');
const { JSDOM } = require('jsdom');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const AF = Object.getPrototypeOf(async function () { }).constructor;
const core = fs.readFileSync('lib/core.js', 'utf8');

const boot = (ua) => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
    global.window = dom.window; global.document = dom.window.document;
    // The device is whatever isMobile() in lib/core.js reads: the user agent. Node has a
    // navigator of its own, and a plain assignment does not replace it.
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent: ua, maxTouchPoints: 0 }, configurable: true, writable: true });
    window.env = { apiUrl: '' };
};
let sent = null, reply = null, pickReply = null, pickAsked = 0, answerAsked = 0, runAgain = [];
const load = async (p, ...a) => {
    if (/table-answer\.py$/.test(p)) { answerAsked++; sent = { question: a[0], canvas: JSON.parse(a[1]) }; return typeof reply === 'function' ? reply(sent) : reply; }
    if (/menu-pick\.py$/.test(p)) { pickAsked++; return pickReply; }
    if (/modal-shield\.js$/.test(p)) return { release() { } };
    if (/working\.js$/.test(p)) return { done() { }, finish() { }, fail() { } };
    if (/project-capabilities\.js$/.test(p)) return { catalogue: () => [], validate: () => ({ ok: false, problem: 'no' }), preview: () => '' };
    if (/project-command\.js$/.test(p) && a[0] && a[0].__again) { runAgain.push(a[0].text); return {}; }
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, []);
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), getIonFunction: () => () => { }, createIonFunction: (f) => f };
const settle = async (n) => { for (let i = 0; i < (n || 12); i++) await new Promise((r) => setTimeout(r, 0)); };

// ---- a canvas like the one in the report -----------------------------------------------------
let uid = 0;
const table = (name, rows, formulas) => {
    const nc = rows[0].length, wells = [];
    for (let c = 0; c < nc; c++) wells.push(rows.map((r, ri) => {
        const w = { uid: 'u' + (++uid), value: r[c], group: {} };
        if (ri === 0) { w.skin_type = 'ColumnHeader'; w.group.ColumnHeader = 1; }
        else if (c === 0) { w.skin_type = 'RowHeader'; w.group.RowHeader = 1; }
        else if (rows[ri][0]) w.group[('' + rows[ri][0]).replace(/[^A-Za-z0-9]+/g, '_')] = 1;
        return w;
    }));
    const t = { name, wells, formula: formulas || {} };
    t.formulaTextForWell = (w) => { for (let c = 0; c < nc; c++) { const r = wells[c].indexOf(w); if (r >= 0) return t.formula['[' + c + ':' + c + '][' + r + ':' + r + ']'] || ''; } return ''; };
    return t;
};
const mkCanvas = () => {
    const assumptions = table('assumptions', [['Ingredient', 'Amount', 'Cost'], ['Pale Malt', '500 lbs', 14], ['Crystal Malt', '50 lbs', 16], ['Ale Yeast', '10 packets', '']]);
    const cap = table('production_capacity', [['Item', 'Value'], ['Malt per keg (lbs)', 50], ['Kegs from Malt', '141.17650'], ['Production Capacity (kegs)', '141.17650']],
        { '[1:1][3:3]': 'min(production_capacity[1:1][2:2])' });
    const zooms = [];
    const pt = { root: [assumptions, cap], selectedPlate: assumptions, zoomToCells: (plate, cells, opts) => zooms.push({ plate: plate.name, cell: cells[0].value, label: opts.label }) };
    return { pt, assumptions, cap, zooms };
};

(async () => {
    boot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36');

    // ---- what the answerer sends ------------------------------------------------------------
    let C = mkCanvas();
    reply = { status: 'OK', answer: { kind: 'read', answer: 'These ingredients make about 141 kegs.', calc: '', result: null, unit: 'kegs',
        from: [{ table: 'production_capacity', at: '[1:1][3:3]', value: '999', why: 'Production Capacity (kegs)' }, { table: 'production_capacity', at: '[7:7][9:9]', value: '1', why: 'made up' },
               { table: 'nowhere', at: '[0:0][0:0]', value: '1', why: 'made up' }], assumed: [], missing: '', next: '' } };
    let out = await load('baja/plate/ops/table-answer.js', C.pt, { question: 'how many kegs does this create', table: 'assumptions' });
    ok(sent.canvas.asked === 'assumptions' && sent.canvas.tables[0].name === 'assumptions' && sent.canvas.tables[1].name === 'production_capacity',
       'the table asked about goes first, and the other tables on the canvas go with it');
    const malt = sent.canvas.tables[0].cells.filter((c) => c.value === '500 lbs')[0];
    ok(malt && malt.at === '[1:1][1:1]' && malt.row === 'Pale Malt' && malt.column === 'Amount' && malt.tags.join() === 'Pale_Malt', 'each cell goes with its address, the names of its row and column, and its tags');
    const total = sent.canvas.tables[1].cells.filter((c) => c.at === '[1:1][3:3]')[0];
    ok(total && total.formula === '=min(production_capacity[1:1][2:2])' && total.row === 'Production Capacity (kegs)', 'and its formula where it has one');
    ok(!sent.canvas.tables[0].cells.some((c) => c.value === ''), 'empty cells are not sent');

    // ---- what it does with the reply -------------------------------------------------------
    ok(out.answer.from.length === 1 && out.answer.from[0].well === C.cap.wells[1][3], 'a cited cell is found again on the canvas; ones that are not there are dropped');
    ok(out.answer.from[0].value === '141.17650', 'and the value shown is the one in the cell, not the one the model quoted');
    ok(out.answer.kind === 'read' && out.answer.unchecked === false && out.table === 'assumptions', 'an answer read from a cell that exists is not marked unchecked');

    reply = { status: 'OK', answer: { kind: 'calculated', answer: 'About 11 kegs.', calc: '(500 + 50) / 50', result: 11, unit: 'kegs',
        from: [{ table: 'assumptions', at: '[1:1][1:1]', value: '500 lbs', why: 'Pale Malt' }], assumed: [], missing: '', next: 'make a new table that works out the kegs' } };
    out = await load('baja/plate/ops/table-answer.js', C.pt, { question: 'how many kegs does this create' });
    ok(out.answer.value === 11 && out.answer.calc === '(500 + 50) / 50' && out.answer.disagrees === false, 'the arithmetic is done again here and agrees: ' + out.answer.value);
    ok(sent.canvas.asked === 'assumptions', 'with no table named, the selected one is the one asked about');
    reply.answer.result = 14;
    out = await load('baja/plate/ops/table-answer.js', C.pt, { question: 'how many kegs' });
    ok(out.answer.value === 11 && out.answer.disagrees === true, 'a figure from the model that the arithmetic does not give is caught');
    reply.answer.calc = 'alert(1)'; reply.answer.result = 5;
    out = await load('baja/plate/ops/table-answer.js', C.pt, { question: 'how many kegs' });
    ok(out.answer.value === null && out.answer.calc === '', 'anything but plain arithmetic is not run and not shown');
    reply = { status: 'OK', answer: { kind: 'read', answer: 'It is 12.', from: [], assumed: [], calc: '', result: null, unit: '', missing: '', next: '' } };
    out = await load('baja/plate/ops/table-answer.js', C.pt, { question: 'what is the total' });
    ok(out.answer.unchecked === true, 'an answer said to be read from the canvas with no cell to show for it is marked unchecked');
    reply = { status: 'ERROR', error: 'model down' };
    out = await load('baja/plate/ops/table-answer.js', C.pt, { question: 'what is the total' });
    ok(/model down/.test(out.error || ''), 'a failure is reported as one');
    out = await load('baja/plate/ops/table-answer.js', { root: [] }, { question: 'what is the total' });
    ok(/no tables/.test(out.error || ''), 'and with no tables there is nothing to answer from');
    reply = () => ({ status: 'OK', answer: { kind: 'describe', answer: 'x', from: [], assumed: [], calc: '', result: null, unit: '', missing: '', next: '' } });
    C.pt.selectedPlate = null;
    await load('baja/plate/ops/table-answer.js', C.pt, { question: 'what does production capacity hold' });
    ok(sent.canvas.asked === 'production_capacity', 'a table named in the question, with spaces for underscores, is the one asked about');

    // ---- the card ---------------------------------------------------------------------------
    const body = () => (document.getElementById('pc-body') || { textContent: '' }).textContent;
    const menus = [{ label: 'File', items: [{ label: 'Open', click: () => { } }] }];
    C = mkCanvas(); answerAsked = 0; pickAsked = 0;
    reply = { status: 'OK', answer: { kind: 'estimate', answer: 'About 11 kegs, as an estimate.', calc: '(500+50)/50', result: 11, unit: 'kegs',
        from: [{ table: 'assumptions', at: '[1:1][1:1]', value: '500 lbs', why: 'Pale Malt' }, { table: 'assumptions', at: '[1:1][2:2]', value: '50 lbs', why: 'Crystal Malt' }],
        assumed: ['50 lbs of malt per keg'], missing: 'a row for malt per keg', next: 'make a new table that works out how many kegs these make' } };
    await load('baja/plate/menu/project-command.js', { menus, text: 'how many kegs does this create', pm: C.pt, context: { asked_from: { type: 'table', name: 'assumptions' } } });
    await settle();
    ok(/An estimate/.test(body()) && /About 11 kegs/.test(body()) && !/Nothing here does that/.test(body()), 'the question is answered on the card, not refused');
    ok(pickAsked === 0 && answerAsked === 1, 'and the menus are not searched for something to run');
    ok(/\(500\+50\)\/50 = 11 kegs/.test(body()), 'the working is shown: ' + (document.getElementById('pc-calc') || {}).textContent);
    ok(/Not on the canvas, assumed:/.test(body()) && /50 lbs of malt per keg/.test(body()) && /To make it exact: a row for malt per keg/.test(body()), 'with what was assumed and what would make it exact');
    ok(/Nothing was changed/.test(body()), 'and it says nothing on the canvas was changed');
    let chips = document.querySelectorAll('.pc-cell');
    ok(chips.length === 2 && /assumptions: Pale Malt = 500 lbs/.test(chips[0].textContent), 'the cells it came from are listed: ' + chips[0].textContent);
    chips[1].onclick(); await settle();
    ok(C.zooms.length === 1 && C.zooms[0].plate === 'assumptions' && C.zooms[0].cell === '50 lbs' && !document.getElementById('baja-project-command'), 'pressing one closes the card and shows that cell');

    // "Put it on the canvas" hands the suggested request back to the command card.
    await load('baja/plate/menu/project-command.js', { menus, text: 'how many kegs does this create', pm: C.pt, __again: false });
    await settle();
    const nx = document.getElementById('pc-next');
    ok(!!nx && /That runs: make a new table that works out how many kegs these make/.test(body()), 'the request that would build it is offered, and spelled out');

    // A request, and a how-to, are not questions for the tables.
    for (const [t, why] of [['can you add four rows', 'a request phrased as a question'], ['how do I add a row', 'a question about the app']]) {
        answerAsked = 0; pickAsked = 0; pickReply = { status: 'OK', pick: 0, explain: '', alternatives: [], unsupported: '' };
        await load('baja/plate/menu/project-command.js', { menus, text: t, pm: C.pt }); await settle();
        ok(pickAsked === 1 && answerAsked === 0 && /File > Open/.test(body()), '"' + t + '" goes to the menus as before: ' + why);
    }
    // Something the menus cannot place is put to the answerer.
    answerAsked = 0; pickAsked = 0; pickReply = { status: 'OK', pick: null, explain: '', alternatives: [0], unsupported: 'cannot interpret that' };
    reply = { status: 'OK', answer: { kind: 'read', answer: 'Capacity is 141 kegs.', calc: '', result: null, unit: '', from: [{ table: 'production_capacity', at: '[1:1][3:3]', value: '', why: 'Production Capacity (kegs)' }], assumed: [], missing: '', next: '' } };
    await load('baja/plate/menu/project-command.js', { menus, text: 'kegs this makes', pm: C.pt }); await settle();
    ok(pickAsked === 1 && answerAsked === 1 && /Capacity is 141 kegs/.test(body()) && !/Nothing here does that/.test(body()), 'words the menus cannot place, that the tables can answer, are answered');
    ok(document.querySelectorAll('.pc-alt').length === 1 && !document.getElementById('pc-next'), 'with the nearest menu items still offered, and no "put it on the canvas" for a cell that is already there');
    // ...and when the tables cannot either, the plain refusal stands for a non-question.
    reply = { status: 'OK', answer: { kind: 'cannot', answer: 'The canvas does not say.', calc: '', result: null, unit: '', from: [], assumed: [], missing: 'x', next: '' } };
    await load('baja/plate/menu/project-command.js', { menus, text: 'email a weekly report', pm: C.pt }); await settle();
    ok(/Nothing here does that/.test(body()) && /cannot interpret that/.test(body()), 'a request nothing does is still refused plainly');
    answerAsked = 0;
    await load('baja/plate/menu/project-command.js', { menus, text: 'what is the price of hops in Oregon', pm: C.pt }); await settle();
    ok(/The canvas does not hold that/.test(body()) && /It would need: x/.test(body()) && answerAsked === 1, 'a question the canvas cannot answer says so, and what it would need, having asked once');

    // ---- desktop, then a phone --------------------------------------------------------------
    let panel = document.getElementById('baja-project-command');
    ok(/translateX\(-50%\)/.test(panel.style.cssText) && /overflow-y:\s*auto/.test(panel.style.cssText) && panel.className !== 'baja-pc-mobile', 'on a desktop the card is centred, and scrolls inside itself if it is tall');
    boot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1');
    C = mkCanvas();
    reply = { status: 'OK', answer: { kind: 'calculated', answer: 'Eleven kegs.', calc: '550/50', result: 11, unit: 'kegs', from: [{ table: 'assumptions', at: '[1:1][1:1]', value: '', why: 'Pale Malt' }], assumed: [], missing: '', next: 'make a table of kegs' } };
    await load('baja/plate/menu/project-command.js', { menus, text: 'how many kegs does this create from everything in the assumptions table', pm: C.pt }); await settle();
    panel = document.getElementById('baja-project-command');
    const css = panel.style.cssText;
    ok(panel.className === 'baja-pc-mobile' && /left:\s*8px/.test(css) && /right:\s*8px/.test(css) && !/translateX/.test(css), 'on a phone the card runs edge to edge');
    ok(/max-height:\s*calc\([^)]*100vh[^)]*\)/.test(css) && /72px/.test(css) && /overflow-y:\s*auto/.test(css), 'and scrolls inside itself, never off the bottom of the screen');
    const req = panel.firstChild.firstChild;
    ok(/white-space:\s*normal/.test(req.style.cssText) && !/ellipsis/.test(req.style.cssText) && /from everything in the assumptions table/.test(req.textContent), 'the whole request is shown, wrapped, not cut off');
    const rules = (document.getElementById('baja-pc-css') || { textContent: '' }).textContent;
    ok(/\.baja-pc-mobile button\{min-height:44px/.test(rules) && /\.baja-pc-mobile input,\.baja-pc-mobile select\{font-size:16px/.test(rules), 'buttons are a finger high, and text boxes are 16px so the phone does not zoom the page');
    ok(/\.baja-pc-mobile #pc-body \.pc-row\{flex-direction:column/.test(rules) && document.querySelectorAll('#pc-body .pc-row').length === 2, 'the cells and the buttons stack, one to a line');
    ok(/Eleven kegs/.test(body()) && /550\/50 = 11 kegs/.test(body()), 'and the answer is all there');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
