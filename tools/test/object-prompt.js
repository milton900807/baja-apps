// A TEXT FIELD ON THE OBJECT ITSELF.
//
//     node tools/test/object-prompt.js
//
// A real input positioned over the canvas and kept in step with the object underneath it.
// The things that go wrong are all about position and lifetime: a field left floating over
// nothing after the selection changes, a field sitting somewhere meaningless when the object
// scrolls away, and keystrokes leaking through to the canvas shortcuts underneath.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
let frames = [];
global.requestAnimationFrame = (f) => { frames.push(f); return frames.length; };
global.cancelAnimationFrame = () => { };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
let asked = null;
const load = async (p, ...a) => {
    if (/project-command\.js$/.test(p)) { asked = a[0]; return {}; }
    if (/timeline-interpreter\.js$/.test(p)) return { executeCommand: async () => ({ type: 'none' }) };
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// A canvas 1000x600 device pixels, laid out at 500x300 CSS pixels: everything the grid
// returns is in device pixels, so the field has to halve it or it lands twice as far out.
const canvas = { width: 1000, height: 600, getBoundingClientRect: () => ({ left: 100, top: 50, right: 600, bottom: 350, width: 500, height: 300 }) };
const mkTrack = (obj) => ({
    root: obj ? [obj] : [], selectedPlate: obj, setMessage() { }, wake() { },
    grid: {
        canvas: { getCTX: () => ({ canvas }) },
        X: (x) => x, Y: (y) => y,
        screenWidth: (w) => w, screenHeight: (h) => h
    }
});
const mkObj = (name, x, yBottom, w, h) => ({
    name: name, type: 'timeline',
    grid: { xi: x, yi: yBottom, width: w, height: h },
    getHeight: () => h
});
const el = () => document.getElementById('baja-object-prompt');
const run = (pt, obj) => load('baja/plate/menu/object-prompt.js', pt, obj);
const draw = () => { const f = frames.slice(); frames = []; f.forEach((fn) => fn()); };

(async () => {
    const tl = mkObj('strehg', 200, 500, 600, 400);   // device px: x 200..800, y 100..500
    const pt = mkTrack(tl);
    await run(pt, tl);
    draw();

    ok(!!el(), 'a field is put on the page');
    ok(el().style.display === 'block', 'and shown: ' + el().style.display);
    // canvas CSS origin (100,50) + device/2
    ok(el().style.left === '200px', 'LEFT EDGE OF THE OBJECT, in CSS pixels: ' + el().style.left);
    ok(el().style.top === '100px', 'and its TOP, just under the title bar: ' + el().style.top);
    ok(el().style.width === '300px', 'as wide as the object: ' + el().style.width);
    ok(/^fixed$/.test(el().style.position), 'positioned against the viewport, so it tracks scrolling');

    const inp = document.getElementById('baja-object-prompt-q');
    ok(!!inp && /strehg/.test(inp.placeholder), 'it names the timeline it belongs to: ' + inp.placeholder);

    // IT FOLLOWS. Move the object and the next frame moves the field.
    tl.grid.xi = 400;
    draw();
    ok(el().style.left === '300px', 'the field follows the object: ' + el().style.left);

    // AND IT HIDES rather than sitting somewhere meaningless.
    tl.grid.width = 100;                       // 50 CSS px: too narrow to type in
    draw();
    ok(el().style.display === 'none', 'too small to type in, so it hides');
    tl.grid.width = 600; draw();
    ok(el().style.display === 'block', 'and comes back when there is room');

    tl.grid.xi = 5000; draw();                 // off the right of the canvas
    ok(el().style.display === 'none', 'off the canvas, so it hides');
    tl.grid.xi = 400; draw();

    // KEYSTROKES DO NOT REACH THE CANVAS UNDERNEATH
    let leaked = 0;
    document.body.addEventListener('keydown', () => { leaked++; });
    const ev = new dom.window.KeyboardEvent('keydown', { key: 'a', bubbles: true });
    inp.dispatchEvent(ev);
    ok(leaked === 0, 'a keystroke in the field does not also reach the canvas shortcuts');

    // ENTER SENDS IT
    inp.value = 'add a kickoff milestone on December 1st';
    inp.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
    ok(!!asked && asked.text === 'add a kickoff milestone on December 1st',
       'Enter sends what was typed');
    ok(asked.context && asked.context.showing === 'a timeline', 'with the timeline as the context');
    ok(inp.value === '', 'and the field is cleared for the next one');

    // ONE AT A TIME
    const other = mkObj('second', 0, 500, 600, 400);
    await run(mkTrack(other), other);
    ok(document.querySelectorAll('#baja-object-prompt').length === 1,
       'opening it for another object leaves only one field');

    // CLOSED when the selection is not a timeline
    await run(mkTrack(null), null);
    ok(!el(), 'and it goes away when nothing is selected');

    // and the loop stops rather than running on over nothing
    const before = frames.length;
    draw();
    ok(frames.length === 0, 'its frame loop stops with it (' + before + ' pending before, 0 after)');

    console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
    process.exit(fails ? 1 : 0);
})();
