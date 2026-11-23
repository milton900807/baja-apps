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

    // The canvas hovers, highlights and drags from the MOVE, through a listener on the
    // window, which a panel in front of it does not interrupt: those count as mouse events
    // passing through to the canvas just as much as a click does.
    const moved = { canvas: 0, window: 0 };
    canvas.addEventListener('mousemove', () => moved.canvas++);
    window.addEventListener('mousemove', () => moved.window++);

    // WITHOUT the shield: the canvas hears its own events, which is the normal state
    fire(canvas, 'mousedown'); fire(canvas, 'mouseup'); fire(canvas, 'click'); fire(canvas, 'mousemove');
    ok(heard.down === 1 && heard.up === 1 && heard.click === 1,
       'with no panel up, the canvas hears presses as it always did');
    ok(moved.canvas === 1, 'and moves, which is how it hovers and drags');
    moved.canvas = 0; moved.window = 0;

    const shield = await load('baja/lib/modal-shield.js', panel, { allow: ['.ls-sug'] });

    // THE RELEASE OF THE PRESS THAT OPENED THE PANEL IS LET OUT. A panel opened by a press
    // on the canvas is in front of the pointer when the button comes up, so that release
    // lands on the panel. The window's mouseup is what ENDS a drag, and swallowing this
    // one would strand the canvas mid-drag.
    const winClicks = { n: 0 };
    window.addEventListener('click', () => winClicks.n++);
    fire(button, 'mouseup');
    ok(heard.windowUp === 2, 'a release on the panel with no press on it first still reaches the window, which ends any drag');

    // THE PANEL'S OWN BUTTON, PRESSED: IT WORKS, AND NONE OF IT LEAVES THE PANEL. This is
    // the Cancel button. Its release used to carry on up to the window while the box was
    // still on screen, and the canvas acted on it.
    fire(button, 'mousedown'); fire(button, 'mouseup'); fire(button, 'click');
    ok(pressedButton === 1, 'the panel’s own button still fires');
    ok(heard.down === 1 && heard.click === 1,
       'and the canvas element is not told about it, because it never happened there');
    ok(heard.windowUp === 2 && winClicks.n === 0, 'nor is the window: the release and the click of a press on the panel stay in the panel');
    fire(button, 'mouseup');
    ok(heard.windowUp === 2, 'and once the panel has been pressed, no later release on it gets out either');

    // its list, which lives outside the panel, works too
    fire(sug, 'mousedown');
    ok(pressedSug === 1, 'a list the panel owns outside itself still works');

    // MOVING OVER THE CANVAS IS STOPPED TOO, which is the half that was missed: a press is
    // not the only thing a canvas listens to.
    fire(canvas, 'mousemove');
    ok(moved.canvas === 0 && moved.window === 0,
       'a move over the canvas under the panel reaches neither it nor the window');
    let movedOnButton = 0;
    button.addEventListener('mousemove', () => movedOnButton++);
    fire(button, 'mousemove');
    ok(movedOnButton === 1 && moved.window === 0, 'a move inside the panel reaches the panel and stops there: the canvas does not hover under it');

    // anything on the canvas is swallowed while the panel is up
    const before = { ...heard };
    fire(canvas, 'mousedown'); fire(canvas, 'mouseup'); fire(canvas, 'click');
    ok(heard.down === before.down && heard.up === before.up && heard.click === before.click,
       'while the panel is up the canvas hears nothing, press or release');
    ok(heard.windowUp === before.windowUp, 'and neither does the window');

    // A DIALOG THAT OPENS ON TOP OF THE PANEL STILL WORKS. This is the one that bit: the
    // card asked "there is no table called Employees, make it?" through core's own prompt,
    // which is appended to the body and so sits outside the card -- and its OK button did
    // nothing, because the shield was swallowing every click that was not in the card.
    const over = document.createElement('div');
    over.id = 'baja-prompt-panel';
    over.style.position = 'fixed';
    over.style.zIndex = '2147483000';          // core's own prompt panel z-index
    const okBtn = document.createElement('button');
    let pressedOk = 0;
    okBtn.addEventListener('click', () => pressedOk++);
    over.appendChild(okBtn);
    document.body.appendChild(over);

    fire(okBtn, 'mousedown'); fire(okBtn, 'mouseup'); fire(okBtn, 'click');
    ok(pressedOk === 1, 'OK on a dialog opened over the panel works');

    // and one that is NOT above it is still stopped
    const under = document.createElement('div');
    under.style.position = 'fixed';
    under.style.zIndex = '1';
    const sneaky = document.createElement('button');
    let pressedSneaky = 0;
    sneaky.addEventListener('click', () => pressedSneaky++);
    under.appendChild(sneaky);
    document.body.appendChild(under);
    fire(sneaky, 'click');
    ok(pressedSneaky === 0,
       'while a layer BELOW the panel is still stopped, even its own button: that is what '
       + 'being under a modal means');
    const beforeUnder = heard.click;
    fire(canvas, 'click');
    ok(heard.click === beforeUnder, 'and the canvas stays shielded');

    document.body.removeChild(over);
    document.body.removeChild(under);

    // THE TAIL OF THE CLOSING GESTURE. The panel goes; the release and click that follow the
    // press that closed it must not land on what was underneath.
    panel.parentNode.removeChild(panel);
    shield.release();
    fire(canvas, 'mouseup'); fire(canvas, 'click');
    ok(heard.up === before.up && heard.click === before.click,
       'the release and click after the panel is gone are swallowed too');

    // and then it really comes down
    await sleep(500);
    fire(canvas, 'mousemove');
    ok(moved.canvas === 1, 'moves reach the canvas again once the shield is down');
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

    // ---- THE ASK BOX'S CANCEL, PRESSED THE MOMENT THE BOX IS UP ------------------------
    // The report: Cancel on "Ask about Batch Schedule" let its release through to the
    // canvas. The box's shield is fetched and is not there yet when the box first shows,
    // so the box holds its own events from the start. Pressed here before anything has
    // had time to load.
    await sleep(450);
    global.lion_engine = { exec: (p, ...a) => new Promise((res) => setTimeout(() => load(p, ...a).then(res), 60)) };
    const seen = { up: 0, click: 0, down: 0, move: 0 };
    const count = (k) => () => seen[k]++;
    window.addEventListener('mouseup', count('up')); window.addEventListener('click', count('click'));
    window.addEventListener('mousedown', count('down')); window.addEventListener('mousemove', count('move'));
    let answer = 'unset';
    const asking = load('baja/lib/prompt-text.js', { title: 'Ask about Batch Schedule', message: 'x', actions: [{ key: 'go', label: 'GO' }] }).then((v) => { answer = v; });
    await sleep(5);
    const cancel = document.getElementById('pt-cancel');
    ok(!!cancel, 'the Ask box is up');
    fire(cancel, 'mousemove'); fire(cancel, 'mousedown'); fire(cancel, 'mouseup');
    ok(seen.down === 0 && seen.up === 0 && seen.move === 0 && !!document.getElementById('baja-prompt-text'),
       'pressing Cancel, before the shield has even loaded: the window hears no press, no release and no move while the box is still up');
    fire(cancel, 'click');
    await asking;
    ok(answer === null && !document.getElementById('baja-prompt-text') && seen.click === 0, 'the click cancels the box, and that does not reach the window either');
    const go = fs.readFileSync('baja/plate/menu/project-command.js', 'utf8');
    ok(/el\.addEventListener\(name, hold\)/.test(pt) && /el\.addEventListener\(name, hold\)/.test(go), 'the Ask box and the operations card both hold their own events from the moment they are on screen');
    await sleep(500);

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
