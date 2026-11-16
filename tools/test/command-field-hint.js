// THE COMMAND FIELD SAYS WHAT IT IS TALKING TO.
//
//     node tools/test/command-field-hint.js
//
// It is the same box in the same place whatever is selected, so nothing told you that what
// you type goes to the timeline in front of you rather than to the project in general. The
// feature was reported missing twice while it was sitting there unlabelled.
//
// Also: the fields whose legacy is the INTERPRETER must let it answer first. It already
// reads plain language for a timeline, and routing sentences past it to the newer panel
// quietly removed a feature that worked.
const fs = require('fs');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const src = fs.readFileSync('manchester/controls/navigation-panel-plates2.js', 'utf8');

// the hint itself, run for real
const k = src.indexOf('const __fieldHint = () => {');
let i = src.indexOf('{', k + 20), d = 0, j = i;
for (;; j++) { const ch = src[j]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } }
const body = src.slice(i + 1, j);
const hintFor = (sel) => new Function('selectedPlate', body)(sel);

const tl = hintFor({ type: 'timeline', name: 'strehg' });
ok(/timeline/i.test(tl), 'with a timeline selected the field says so: ' + tl);
ok(/strehg/.test(tl), 'and names it, so there is no doubt which one');
ok(/milestone/.test(tl), 'and says what it can be asked for');

const tbl = hintFor({ name: 'hellowrold' });
ok(/hellowrold/.test(tbl), 'with a table selected it names the table: ' + tbl);
ok(/formula/.test(tbl), 'and still mentions formulas, which is what it has always taken');

const none = hintFor(null);
ok(typeof none === 'string' && none.length > 0 && !/null|undefined/.test(none),
   'with nothing selected it still says something sensible: ' + none);
ok(hintFor({ type: 'timeline' }).indexOf('(') < 0, 'an unnamed timeline gets no empty brackets');

// every command field carries it
const fields = (src.match(/cmd: createIon\(async \(str, panel\) => runCommandText/g) || []).length;
const hints = (src.match(/placeholder: __fieldHint\(\),/g) || []).length;
ok(fields > 0 && hints === fields,
   'every one of the ' + fields + ' command fields carries the hint (' + hints + ')');

// the interpreter goes first wherever it is the legacy, and nowhere else
const legacyFirst = (src.match(/\}, true\)\),/g) || []).length;
ok(legacyFirst === 6, 'the six interpreter fields let it answer first (' + legacyFirst + ')');
const fk = src.indexOf('pt.createPlateFromFormula(str)');
ok(src.slice(fk, fk + 80).indexOf(', true') < 0,
   'and the FORMULA field does not: a sentence run through it first would make a junk plate');

// the interpreter has to report whether it took the request
ok(/return true;/.test(src.slice(src.indexOf('await pt.zoomto(rect_x'), src.indexOf('await pt.zoomto(rect_x') + 200)),
   'the interpreter path reports that it handled the text');
ok(/handled = !!\(await legacy\(t, panel\)\)/.test(src),
   'and the router only falls through to the panel when it did not');

console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
process.exit(fails ? 1 : 0);
