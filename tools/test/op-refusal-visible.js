// A REFUSED OPERATION IS SEEN.
//
//     node tools/test/op-refusal-visible.js
//
// An operation that refuses says exactly why: "this timeline runs Nov 30 to Jan 15, and
// November 22 falls outside it". That sentence used to go to setMessage, a canvas toast,
// AFTER the card had closed -- so a GO press on an impossible request looked like a button
// that did nothing, which is the one failure this app keeps making in different places.
//
// This checks the two halves of the fix: the card stays up and carries the reason, and the
// model is told the window up front so it stops proposing dates outside it.
const fs = require('fs');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const src = fs.readFileSync('baja/plate/menu/project-command.js', 'utf8');
const k = src.indexOf('const runOp = async () => {');
ok(k > 0, 'the card runs the operation');
// The operation is awaited through the spinner wrapper now, so that is the call to find.
ok(src.indexOf('await withSpinner', k) > k, 'through the wrapper that says it is running');
const run = src.slice(k, src.indexOf('};', src.indexOf('close();', k)) + 2);

ok(!/^\s*close\(\);/m.test(run.slice(0, run.indexOf('await withSpinner'))),
   'and does NOT close before it knows what happened');
ok(/if \(out && out\.error\)/.test(run), 'it reads the refusal');
ok(/That did not happen/.test(run), 'and says so on the card itself');
ok(/H\(out\.error\)/.test(run), 'with the operation’s own words, not a generic failure');
ok(run.indexOf('setError') < run.indexOf('That did not happen'),
   'the canvas message still goes out as well, for anyone watching there');
ok(/#pc-cancel'\)\.onclick = close/.test(run),
   'the card can be closed: a replaced card is wired again, since the setup wiring ran once');
ok(run.lastIndexOf('close();') > run.indexOf('That did not happen'),
   'and it still closes when the operation worked');
ok(/b\.disabled = true/.test(run), 'the button says it is working, so GO is not pressed twice');

// the model is told the window
const cap = fs.readFileSync('baja/plate/menu/project-capabilities.js', 'utf8');
const i = cap.indexOf("name: 'timeline_add'");
const decl = cap.slice(i, i + 1600);
ok(/THE DATE DOES NOT HAVE TO FALL INSIDE THE/.test(decl),
   'timeline_add says a date outside the window is allowed');
ok(/grows the timeline to take it in/.test(decl), 'because the timeline grows to take it in');
ok(/never moved to the nearest day that happens to fit/.test(decl),
   'and the date is never nudged to one that fits');
ok(/never refused for being outside it/.test(decl), 'nor refused for being outside');

// the ask box is what puts that window in the context
const ask = fs.readFileSync('baja/plate/ops/timeline-ask.js', 'utf8');
ok(/start: from \|\| null/.test(ask) && /end: to \|\| null/.test(ask),
   'and the frame button sends the window with the request');

// the operation still refuses rather than drawing off the axis
const add = fs.readFileSync('baja/plate/ops/timeline-add.js', 'utf8');
ok(/__tlSetWindow/.test(add), 'the operation grows the window with the track\u2019s own mover');
ok(/falls outside it/.test(add),
   'and still refuses where there is no mover, rather than drawing off the axis');
ok(/inWindow\(a\) \|\| !inWindow\(b\)/.test(add), 'both ends of an interval included');

console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
process.exit(fails ? 1 : 0);
