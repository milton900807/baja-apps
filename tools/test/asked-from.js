// THE REQUEST SAYS WHICH WINDOW IT CAME FROM.
//
//     node tools/test/asked-from.js
//
// "Zoom out about 10%", typed into a timeline's own Ask button, matched the project's global
// Zoom out: right about the words, wrong about the request. The object was in the context
// all along, but a context sits beside the request and the request itself said nothing, so
// the match was made against words that belong to the whole canvas.
//
// The fix is one line of plumbing and one rule, and this checks both are where they have to
// be: the prefix is built in project-command.js, so every button that says what it was asked
// from gets it without writing it again, and the model is told what that prefix means.
const fs = require('fs');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const pc = fs.readFileSync('baja/plate/menu/project-command.js', 'utf8');

ok(/const asked = \(context && context\.asked_from\) \|\| null;/.test(pc),
   'the request reads what it was asked from, out of the context');
ok(/'On the ' \+ askedKind/.test(pc), 'and names the kind of window first');
ok(/' named "' \+ askedName/.test(pc), 'then the window’s own name');
ok(/\+ ': ' \+ text\)/.test(pc), 'then what was typed');
ok(/: text;/.test(pc), 'and a request with nothing to preface is sent as it was typed');
ok(/menu-pick\.py', request,/.test(pc), 'the prefixed request is what the model is asked');

// the card still shows the user's own words, not the plumbing
const k = pc.indexOf('const asked = (context && context.asked_from)');
ok(pc.slice(0, k).indexOf('H(text)') > 0 || /H\(text\)/.test(pc),
   'while the card still shows what was typed');

// the model knows what the prefix means
const py = fs.readFileSync('py/bio/project/menu-pick.py', 'utf8');
ok(/A REQUEST THAT BEGINS "On the <kind> named \.\.\." WAS MADE FROM THAT OBJECT/.test(py),
   'the rules say a prefixed request was made from that object');
ok(/is NOT the\n   match/.test(py),
   'and that the thing doing the same word to the whole project is not the match');
ok(/zoom out" on a timeline means showing more of its own range/.test(py),
   'with the case that caused this spelled out');
ok(/copy the object’s name into whichever parameter names it|copy the object's name into whichever parameter names it/.test(py),
   'and says to carry the name into the operation');

// the timeline button supplies it
const ask = fs.readFileSync('baja/plate/ops/timeline-ask.js', 'utf8');
ok(/asked_from: \{/.test(ask), 'the Ask button says what it was asked from');
ok(/type: 'timeline'/.test(ask), 'with the kind of window');
ok(/name: name \|\| null/.test(ask), 'and its name');
ok(/about: \(from && to\)/.test(ask), 'and the dates, so the prefix carries them too');

// zooming a timeline is its range, and the catalogue says so
const cap = fs.readFileSync('baja/plate/menu/project-capabilities.js', 'utf8');
const i = cap.indexOf("name: 'timeline_range'");
const decl = cap.slice(i, i + 2000);
ok(/THIS IS WHAT ZOOMING A TIMELINE MEANS/.test(decl),
   'timeline_range says that zooming a timeline is its range');
ok(/zooming out, '\s*\+\s*'or showing more, widens the range/.test(decl) || /or showing more, widens the range/.test(decl),
   'out is wider');
ok(/zooming in, or showing less, narrows/.test(decl.replace(/'\s*\+\s*'/g, '')), 'in is narrower');

console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
process.exit(fails ? 1 : 0);
