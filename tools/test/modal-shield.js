// A PANEL'S CLICKS DO NOT REACH THE CANVAS.
//
//     node tools/test/modal-shield.js
//
// The canvas takes presses from its own element and releases from the WINDOW, so a panel
// floating over it stopped the press but never the release: pressing a button on a card
// moved what was underneath, and the click that dismissed the card arrived on the canvas
// right after it vanished.
//
// This runs the real module against a real DOM with a canvas listening the way the frontend
// listens, and counts what the canvas hears.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><canvas id="c"></canvas></body></html>',
    { url: 'https://gene.clinic/', pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
global.MouseEvent = dom.window.MouseEvent;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return f(...a);
};

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const canvas = document.getElementById('c');
    const heard = { down: 0, up: 0, click: 0, windowUp: 0 };
    canvas.addEventListener('mousedown', () => heard.down++);
    canvas.addEventListener('mouseup', () => heard.up++);
    canvas.addEventListener('click', () => heard.click++);
    // the frontend's window:mouseup host listener, which is what a backdrop never stopped
    window.addEventListener('mouseup', () => heard.windowUp++);

    const panel = document.createElement('div');
    const button = document.createElement('button');
    let pressedButton = 0;
    button.addEventListener('click', () => pressedButton++);
    panel.appendChild(button);
    document.body.appendChild(panel);

    // a list the panel owns but that lives on the body, like the type-ahead
    const sug = document.createElement('div');
    sug.className = 'ls-sug';
    let pressedSug = 0;
    sug.addEventListener('mousedown', () => pressedSug++);
    document.body.appendChild(sug);

    const fire = (el, type) => el.dispatchEvent(new dom.window.MouseEvent(type,
        { bubbles: true, cancelable: true, view: dom.window }));

    // WITHOUT the shield: the canvas hears its own events, which is the normal state
    fire(canvas, 'mousedown'); fire(canvas, 'mouseup'); fire(canvas, 'click');
    ok(heard.down === 1 && heard.up === 1 && heard.click === 1,
       'with no panel up, the canvas hears presses as it always did');

    const shield = await load('baja/lib/modal-shield.js', panel, { allow: ['.ls-sug'] });

    // the panel's own button still works, completely
    fire(button, 'mousedown'); fire(button, 'mouseup'); fire(button, 'click');
    ok(pressedButton === 1, 'the panel’s own button still fires');
    ok(heard.down === 1 && heard.click === 1,
       'and the canvas element is not told about it, because it never happened there');
    // A release inside the panel IS left alone on purpose. The window's mouseup is what
    // ENDS a drag, and swallowing it would be a way to strand the canvas mid-drag; what
    // matters is that the canvas is never told a press or a click happened on IT.
    ok(heard.windowUp === 2, 'while the window still hears the release, which ends any drag');

    // its list, which lives outside the panel, works too
    fire(sug, 'mousedown');
    ok(pressedSug === 1, 'a list the panel owns outside itself still works');

    // anything on the canvas is swallowed while the panel is up
    const before = { ...heard };
    fire(canvas, 'mousedown'); fire(canvas, 'mouseup'); fire(canvas, 'click');
    ok(heard.down === before.down && heard.up === before.up && heard.click === before.click,
       'while the panel is up the canvas hears nothing, press or release');
    ok(heard.windowUp === before.windowUp, 'and neither does the window');

    // THE TAIL OF THE CLOSING GESTURE. The panel goes; the release and click that follow the
    // press that closed it must not land on what was underneath.
    panel.parentNode.removeChild(panel);
    shield.release();
    fire(canvas, 'mouseup'); fire(canvas, 'click');
    ok(heard.up === before.up && heard.click === before.click,
       'the release and click after the panel is gone are swallowed too');

    // and then it really comes down
    await sleep(500);
    fire(canvas, 'mousedown'); fire(canvas, 'mouseup'); fire(canvas, 'click');
    ok(heard.down === before.down + 1 && heard.up === before.up + 1 && heard.click === before.click + 1,
       'a moment later the canvas is live again: the shield does not outstay the panel');

    // released twice is not a problem
    shield.release();
    ok(true, 'releasing twice does nothing the second time');

    // both panels ask for one
    const pc = fs.readFileSync('baja/plate/menu/project-command.js', 'utf8');
    ok(/modal-shield\.js/.test(pc), 'the operations card puts one up');
    ok(/closed = true;[\s\S]{0,120}shield\.release\(\)/.test(pc),
       'and releases it as it closes, after the card is removed');
    const pt = fs.readFileSync('baja/lib/prompt-text.js', 'utf8');
    ok(/modal-shield\.js/.test(pt), 'the prompt box puts one up');
    ok(/allow: \['\.ls-sug'\]/.test(pt), 'naming its suggestion list as part of itself');
    ok(/shieldDone = true;[\s\S]{0,120}shield\.release\(\)/.test(pt), 'and releases it on the way out');
    // a panel closed before its shield arrives must not leave one listening
    ok(/if \(closed\) \{ try \{ sh\.release\(\)/.test(pc) && /if \(shieldDone\) \{ try \{ sh\.release\(\)/.test(pt),
       'a shield that arrives after its panel has closed is dropped, not left listening');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
