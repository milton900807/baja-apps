// A TABLE NAME IS WHATEVER IS IN FRONT OF THE BRACKETS.
//
//     node tools/test/formula-key-names.js
//
// A formula is held under the table's name followed by the cell it sits in: "cost[1:1][7:7]".
// The name was read with \w+, so "Operating Costs" or "cost-2" did not match and the parser
// returned null -- and all fourteen callers destructure it on the spot, which throws inside a
// try that swallows it. The formula was skipped in silence: the cell went on showing the text
// that was typed into it, as though nothing had been entered, while the total built on that
// text went red. Nothing anywhere said why.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// The real parsers, lifted from the three files that each carry one.
const lift = (file) => {
    const src = fs.readFileSync(file, 'utf8');
    const at = src.indexOf('function parseTableStructure(input) {');
    if (at < 0) throw new Error('no parseTableStructure in ' + file);
    // Counted braces, not a lazy regex: the function holds a nested one (parseCoord) and
    // stopping at the first closing brace lifts half a function.
    let depth = 0, end = -1;
    for (let i = src.indexOf('{', at); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    // eslint-disable-next-line no-eval
    return eval('(' + src.slice(at, end).replace(/^function parseTableStructure/, 'function') + ')');
};

const files = ['baja/plate/plate-track.js', 'baja/plate/timeline-track.js', 'baja/plate/plate-track-view.js'];

(async () => {
    for (const f of files) {
        const parse = lift(f);
        const who = f.split('/').pop();

        // Names that always worked, and must go on working.
        ok(parse('cost[1:1][7:7]').tableName === 'cost', who + ': a plain name still reads');
        ok(parse('costs_1[0:0][1:1]').tableName === 'costs_1', who + ': and one with an underscore');

        // The names that silently killed the formula.
        ok(parse('Operating Costs[1:1][7:7]').tableName === 'Operating Costs',
           who + ': a name with a space is a name: ' + JSON.stringify(parse('Operating Costs[1:1][7:7]').tableName));
        ok(parse('cost-2[1:1][1:1]').tableName === 'cost-2', who + ': and one with a hyphen');
        ok(parse("Jeff's costs[1:1][1:1]").tableName === "Jeff's costs", who + ': and one with an apostrophe');

        // The row and column still come out right, which is what the callers use.
        const p = parse('Operating Costs[1:1][7:7]');
        ok(p.startX === 1 && p.stopX === 1 && p.startY === 7 && p.stopY === 7,
           who + ': the cell it names is unchanged: ' + JSON.stringify([p.startX, p.stopX, p.startY, p.stopY]));

        // AND IT NEVER RETURNS NULL, because every caller destructures it where it stands.
        for (const junk of ['', 'nonsense', 'cost[1:1]', null, undefined, 'cost[1:1][7:7]extra']) {
            let threw = false, r = null;
            try { const { tableName, startX, stopX, startY, stopY } = parse(junk); r = tableName; }
            catch (e) { threw = true; }
            ok(!threw, who + ': destructuring ' + JSON.stringify(junk) + ' does not throw');
        }
        ok(parse('nonsense').tableName === null,
           who + ': and an unreadable key says it has no table rather than pretending');
    }

    // ---- the silence itself --------------------------------------------------------
    const track = fs.readFileSync('baja/plate/plate-track.js', 'utf8');
    ok(/A FORMULA THAT IS NOT WORKED OUT MUST SAY SO/.test(track),
       'a formula that cannot be dispatched marks its own cell');
    ok(/setError\(why\)/.test(track), 'with the reason on the cell, where the user is looking');
    ok(/is not on this canvas/.test(track) && /could not be worked out from/.test(track),
       'and the two reasons are told apart: a table that is not here, and a key that cannot '
       + 'be read at all');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
