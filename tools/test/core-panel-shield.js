// CANCEL ON A CORE DIALOG IS NOT ALSO A CLICK ON THE CANVAS.
//
//     node tools/test/core-panel-shield.js
//
// prompt() and infoPrompt() stopped keys and clipboard events -- a pasted description must
// not become tracks -- and nothing else. The canvas takes presses from its own element and
// releases from the window, and hovers and drags from the move, so pressing Cancel was a
// click the canvas got too: the panel went and the release landed on whatever was under it.
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
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// core.js is a prelude, not a module: it is evaluated here so prompt() can be called.
const api = new AF('exec', 'args', core + '\nreturn { prompt, infoPrompt };')(load, {});

(async () => {
    const { prompt: corePrompt, infoPrompt } = await api;
    const canvas = document.getElementById('c');
    const heard = { down: 0, up: 0, click: 0, move: 0, winUp: 0 };
    canvas.addEventListener('mousedown', () => heard.down++);
    canvas.addEventListener('mouseup', () => heard.up++);
    canvas.addEventListener('click', () => heard.click++);
    canvas.addEventListener('mousemove', () => heard.move++);
    window.addEventListener('mouseup', () => heard.winUp++);
    const fire = (el, type) => el.dispatchEvent(new dom.window.MouseEvent(type,
        { bubbles: true, cancelable: true, view: dom.window }));

    // with nothing open, the canvas is live
    fire(canvas, 'mousedown'); fire(canvas, 'click'); fire(canvas, 'mousemove');
    ok(heard.down === 1 && heard.click === 1 && heard.move === 1, 'the canvas starts live');

    const answer = corePrompt('Name it', ['Name'], { Name: '' }, 300, 300);
    await sleep(30);                       // the shield is fetched, then taken
    const panel = document.getElementById('baja-prompt-panel');
    ok(!!panel, 'the dialog is up');

    const before = { ...heard };
    fire(canvas, 'mousedown'); fire(canvas, 'mouseup'); fire(canvas, 'click'); fire(canvas, 'mousemove');
    ok(heard.down === before.down && heard.click === before.click && heard.move === before.move,
       'while it is up the canvas hears nothing, moves included');

    // Cancel: its own click works, and is not also a click on the canvas
    const buttons = panel.querySelectorAll('button');
    const cancel = Array.from(buttons).filter((b) => /cancel/i.test(b.textContent))[0];
    ok(!!cancel, 'it has a Cancel button');
    fire(cancel, 'mousedown');
    cancel.onclick(new dom.window.MouseEvent('click', { bubbles: true }));
    const got = await answer;
    ok(got === undefined, 'Cancel answers nothing, as it always did');
    ok(!document.getElementById('baja-prompt-panel'), 'and the dialog is gone');

    // the tail of that gesture: the release and click land after the panel has gone
    fire(canvas, 'mouseup'); fire(canvas, 'click');
    ok(heard.up === before.up && heard.click === before.click,
       'the release and click that follow Cancel do not reach the canvas');

    // and the shield does not outstay the dialog
    await sleep(500);
    fire(canvas, 'mousedown'); fire(canvas, 'click');
    ok(heard.down === before.down + 1 && heard.click === before.click + 1,
       'a moment later the canvas is live again');

    // the same for the info dialog, whose only button is Close
    await infoPrompt('<b>something</b>', 400);
    await sleep(30);
    const info = document.getElementById('baja-info-panel');
    ok(!!info, 'the info dialog is up');
    const mark = { ...heard };
    fire(canvas, 'mousedown'); fire(canvas, 'mousemove');
    ok(heard.down === mark.down && heard.move === mark.move, 'and it shields the canvas too');
    const closeBtn = info.querySelectorAll('button')[0];
    closeBtn.onclick(new dom.window.MouseEvent('click', { bubbles: true }));
    fire(canvas, 'click');
    ok(heard.click === mark.click, 'its Close does not reach the canvas either');
    await sleep(500);

    // one shield, not a second copy of it in core
    const src = fs.readFileSync('lib/core.js', 'utf8');
    ok(/baja\/lib\/modal-shield\.js/.test(src), 'core uses the editor’s own shield');
    ok(!/addEventListener\(name, stop, true\)/.test(src), 'rather than carrying a copy of it');
    ok(/_bajaPanelShield\(wrap\)/.test(src), 'both dialogs take one');
    ok((src.match(/unshield\(\);/g) || []).length >= 2, 'and both release it as they close');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
