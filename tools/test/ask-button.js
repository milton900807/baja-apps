// A BUTTON ON THE TIMELINE'S FRAME, NOT SOMEWHERE ELSE ON THE SCREEN.
//
//     node tools/test/ask-button.js
//
// Four placements, three of which could not be found: twice drawn on the canvas, once on the
// shell toolbar, once on the timeline app's menubar. So what this checks is WHERE it is and
// that the places it used to be are empty. It belongs on the plot's own title bar, beside
// maximize, which is the frame of the object it acts on.
//
// The thing that cannot be tested from here is the pixels. What CAN be tested is that the
// button goes into the one array every part of that bar measures itself from, since the bug
// that geometry caused before was a row drawn in one place and clicked in another.
const fs = require('fs');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const plot = fs.readFileSync('flexigraph/plot.js', 'utf8');

const k = plot.indexOf("// A BUTTON ON THE TIMELINE'S FRAME, NEXT TO MAXIMIZE.");
ok(k > 0, 'the plot declares a frame button');
const blk = plot.slice(k, k + 2200);

ok(/__ensureAskButton\(\) \{/.test(blk), 'added by one function');
ok(/!== 'timeline'\) return;/.test(blk), 'only on a timeline, so a chart keeps its three');
ok(/if \(x && x\.name === 'ask'\) return;/.test(blk), 'and only once, however often it is called');
ok(/name === 'maximize'\) \{ at = i \+ 1/.test(blk), 'placed directly after maximize');
ok(/b\.splice\(at, 0,/.test(blk),
   'spliced into the array itself: the callers already hold a reference and read its length');
ok(/timeline-ask\.js/.test(blk), 'and it asks');

// the one geometry: drawing, both hit tests, the firing and the callouts all measure from
// __btnRowGeom, so the button must exist by the time that answers
ok(/__btnRowGeom\(\) \{\s*\n\s*this\.__ensureAskButton\(\);/.test(plot),
   'the row geometry puts the button there before it measures anything');
const geomUsers = (plot.match(/__btnRowGeom\(\)/g) || []).length;
ok(geomUsers >= 5, 'and everything that touches the row asks that geometry (' + geomUsers + ' places)');
ok(!/let init = \(this\.grid\.xi \+ this\.grid\.width - this\.buttons\.length \* bsize\);[\s\S]{0,400}?button\.highlight\(buttonX/.test(plot),
   'including the hover, which used to work the row out for itself');

// it is readable: a label, not a fourth small round glyph
ok(/ctx\.fillText\(button\.label \|\| button\.name, centerX, centerY\);/.test(plot),
   'drawn with its label');
ok(/const isAsk = button\.name === "ask";/.test(plot) && /isAsk \? \(hovered \? '#fde68a'/.test(plot),
   'in a colour that is not one of the window controls');

// what it asks with
const op = 'baja/plate/ops/timeline-ask.js';
ok(fs.existsSync(op), 'the asking is a module of its own');
const src = fs.readFileSync(op, 'utf8');
ok(/prompt-text\.js/.test(src), 'it opens a box for the text');
ok(/startDate/.test(src) && /endDate/.test(src) && /It runs /.test(src),
   'telling you the dates it covers, so a bare date means something');
ok(/no dates set yet/.test(src), 'and saying so when there are none, rather than inventing a range');
ok(/project-command\.js/.test(src), 'and routes the sentence to the one place that reads sentences');
ok(!/executeCommand/.test(src), 'with no second interpreter of its own');
ok(/__lastMenubar/.test(src), 'against the menus that are actually on screen');
ok(/setMessage/.test(src) || /say\(/.test(src), 'a failure is said, not swallowed');

// every earlier placement is gone
ok(!fs.existsSync('baja/plate/menu/object-prompt.js'), 'the canvas overlay is gone');
ok(!/askButton/.test(fs.readFileSync('manchester/controls/navigation-panel-plates2.js', 'utf8')),
   'the shell toolbar button is gone');
ok(!/A BUTTON ON THE TIMELINE'S OWN BAR/.test(fs.readFileSync('cpd/main-timeline.js', 'utf8')),
   'and the timeline app menubar button is gone: one button, in one place');

console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
process.exit(fails ? 1 : 0);
