// THE OVERLAY'S MAXIMIZE TOGGLE.
//
//     node tools/test/overlay-maximize.js
//
// Fitting to the canvas rect is right for a window read beside the picture it is about and
// wrong for a dense one: the exon stability report got about ten rows of forty and a
// clipped chart. fitToCanvas runs again on every resize, so a caller styling the panel
// itself would have its work undone the first time the window moved.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><canvas width="600" height="400"></canvas></body></html>',
    { url: 'https://gene.clinic/', pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
global.ResizeObserver = function () { this.observe = () => { }; };
window.env = { apiUrl: '' };
// jsdom gives every element a zero rect, so the panel would take the no-canvas fallback;
// a real rect is what the fitted branch needs to be exercised at all.
const cv = document.querySelector('canvas');
cv.getBoundingClientRect = () => ({ left: 40, top: 60, width: 600, height: 400, right: 640, bottom: 460 });
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

(async () => {
    const src = fs.readFileSync('baja/lib/canvas-overlay-panel.js', 'utf8');
    // The module is an anonymous function body: evaluating it yields the function, and
    // calling that yields the module's exports.
    const f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(async () => ({}), {});
    const OV = await f();

    const a = OV.open({ id: 'p1', title: 'fitted', body: 'x' });
    ok(a.isMaximized() === false, 'a panel opens fitted to the canvas by default');
    ok(/600px/.test(a.panel.style.width), 'taking the canvas width: ' + a.panel.style.width);

    const b = OV.open({ id: 'p2', title: 'big', body: 'x', maximized: true });
    ok(b.isMaximized() === true, 'and maximized when the caller asks');
    ok(/100vw/.test(b.panel.style.width) && /100vh/.test(b.panel.style.height),
       'filling the viewport: ' + b.panel.style.width + ' x ' + b.panel.style.height);

    // THE TOGGLE SURVIVES A REFIT, which is the whole reason it lives in this module: the
    // ResizeObserver calls fitToCanvas, and a caller that had styled the panel itself
    // would lose its sizing the first time the window moved.
    b.fit();
    ok(/100vw/.test(b.panel.style.width), 'and a refit keeps it maximized');

    b.setMaximized(false);
    ok(/600px/.test(b.panel.style.width), 'restoring fits the canvas again: ' + b.panel.style.width);
    b.fit();
    ok(/600px/.test(b.panel.style.width), 'and a refit keeps it restored');

    // The button says what it will DO, not what the panel currently is.
    const btns = [...b.head.querySelectorAll('button')].map((x) => x.textContent);
    ok(btns.indexOf('Maximize') >= 0, 'the header offers it: ' + JSON.stringify(btns));
    ok(btns.indexOf('Close') >= 0, 'alongside Close');
    b.setMaximized(true);
    ok([...b.head.querySelectorAll('button')].map((x) => x.textContent).indexOf('Restore') >= 0,
       'and reads Restore once maximized');

    // The title stays the header's first child, which is how callers repaint it.
    ok(b.head.firstChild && b.head.firstChild.textContent === 'big',
       'the title is still the first header child: ' + (b.head.firstChild || {}).textContent);

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
