// TWO EQUALS SIGNS IN FRONT OF A FORMULA ARE ONE.
//
//     node tools/test/double-equals.js
//
// "==beer[Basel_Wheat,Quantity]*beer[Basel_Wheat,Price]" came up in the field at the top,
// and the cell showed the formula's text instead of its answer. Each place a formula is
// shown, typed, stored and read now takes the extra one off. The code is lifted out of the
// files and run, not just matched.
const fs = require('fs');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const F = '==beer[Basel_Wheat,Quantity]*beer[Basel_Wheat,Price]';
const ONE = '=beer[Basel_Wheat,Quantity]*beer[Basel_Wheat,Price]';

// ---- the field at the top: what it shows and what it sends ------------------------------------
const nav = fs.readFileSync('manchester/controls/navigation-panel-plates2.js', 'utf8');
const body = /const oneEquals = \(x\) => \{([\s\S]*?)\n        \};/.exec(nav)[1];
const oneEquals = new Function('x', body);
ok(oneEquals(F) === ONE, 'the field: "==formula" becomes "=formula"');
ok(oneEquals('= =sum(a[1:1][1:3])') === '=sum(a[1:1][1:3])' && oneEquals('===a[1:1][1:1]') === '=a[1:1][1:1]', 'with spaces between them, or three');
ok(oneEquals('==(1+2)*3') === '=(1+2)*3' && oneEquals('==-5') === '=-5' && oneEquals('==.5') === '=.5', 'before a bracket, a sign or a point');
ok(oneEquals(ONE) === ONE && oneEquals('=a[1:1][1:1]==b[1:1][1:1]') === '=a[1:1][1:1]==b[1:1][1:1]', 'a formula with one is untouched, and so is a comparison inside it');
ok(oneEquals('=====') === '=====' && oneEquals('==>') === '==>' && oneEquals('bookmark assumptions') === 'bookmark assumptions', 'and so is anything that is not a formula');
ok(/const t = oneEquals\(\('' \+ \(str \|\| ''\)\)\.trim\(\)\);/.test(nav), 'what is sent is cleaned before anything reads it');
ok((nav.match(/panel\.setText\(oneEquals\('=' \+ tmc\)\)/g) || []).length === 2 && !/panel\.setText\('=' \+ tmc\)/.test(nav),
   'and both places that show a stored formula put one "=" in front, never a second');

// ---- a cell taking a value -------------------------------------------------------------------
const well = fs.readFileSync('baja/plate/well.js', 'utf8');
const a = well.indexOf('setValue(original, update_without_history_stack) {');
const snip = well.slice(well.indexOf('if (typeof v === \'string\' && /^\\s*=\\s*=/.test(v)) {', a), well.indexOf('if (typeof v === \'string\' && v.length > 10000)', a));
ok(snip.length > 50 && snip.length < 600, 'the cell’s own setValue cleans it first, before anything else');
const clean = (v) => new Function('v', snip + '\nreturn v;')(v);
ok(clean(F) === ONE, 'a cell given "==formula" holds "=formula"');
ok(clean('=====') === '=====' && clean('==>') === '==>' && clean('== ==') === '== ==', 'a ruled line or an arrow typed into a cell is left alone');
ok(clean(ONE) === ONE && clean('1400') === '1400' && clean(1400) === 1400, 'and everything else is as it was');

// ---- the table's stored formulas, tidied at each calculation ----------------------------------
const plate = fs.readFileSync('baja/plate/plate.js', 'utf8');
const g = plate.indexOf('getFormula() {');
const part = plate.slice(g, g + 2600);
ok(/const afterEq = raw\.replace\(\/\^\(=\\s\*\)\+\/, ''\)\.trim\(\);/.test(part) && /this\.formula\[k\] = afterEq;/.test(part) && !/this\.formula\[k\] = raw\.slice\(1\);/.test(part),
   'a formula already stored with two is stored with none, as the table keeps them');
const strip = (raw) => raw.replace(/^(=\s*)+/, '').trim();
ok(strip(F) === ONE.slice(1) && strip(ONE) === ONE.slice(1), 'so an old "==" is repaired the next time the project calculates');

console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
process.exit(fails ? 1 : 0);
