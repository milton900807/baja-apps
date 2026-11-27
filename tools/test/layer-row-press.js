// A PRESS ON A LAYER'S LABEL ROW OPENS ITS MENU.
//
//     node tools/test/layer-row-press.js          (needs jsdom)
//
// The rows under a track's name highlight under the pointer and draw a chevron saying
// there is a menu here, and the press that opens it travels through a window-level capture
// listener, a hit test against rectangles the track stamps each frame, and two guards. Any
// of those can stop it, and when one does the user sees a row that reacts to the pointer
// and a press that does nothing, which is indistinguishable from a broken button. So the
// path is driven end to end here rather than trusted.
const fs = require('fs');
const { JSDOM } = require('jsdom');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const dom = new JSDOM('<!doctype html><html><body><div id="box"><canvas id="cv" width="1200" height="800"></canvas></div></body></html>',
    { url: 'https://gene.clinic/', pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const cv = document.getElementById('cv');
cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800 });
document.elementFromPoint = () => cv;

const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };
global.prompt = async () => null;

const press = async (x, y) => {
    window.dispatchEvent(new dom.window.MouseEvent('pointerdown', { clientX: x, clientY: y, button: 0, bubbles: true }));
    await new Promise((r) => setTimeout(r, 40));
};
const popup = () => document.getElementById('baja-layer-popup');
const close = () => { try { window.__bajaLayerPopup.destroy(); } catch (e) { } };

const mkGraph = () => {
    const layer = { name: 'DNM3_3utr_RBP_U2AF1', visible: true, color: '#8ab' };
    const track = { name: 'DNM3_3utr', track_layers: [layer, { name: 'ACC', visible: true }] };
    track.__layerTabs = [{ x: 60, y: 120, w: 160, h: 16, layer: layer, track: track }];
    const said = [];
    return {
        track: [track], said: said, __track: track, __layer: layer,
        canvas: { canvas: { nativeElement: cv }, getCTX: () => cv.getContext('2d') },
        wake() { }, setMessage(m) { said.push(m); }, pushOntoHistory() { },
        side_menu: null, menuVisible: () => false, clearMouseListeners() { }, setMouseMode() { }
    };
};

(async () => {
    const g = mkGraph();
    await load('baja/manchester/menu/layer-row-press.js', g, {});

    await press(100, 126);
    ok(!!popup(), 'a press on a row opens that layer’s menu');
    const last = window.__bajaLayerRow.last;
    ok(last.hit === true && last.opened === 'popup', 'and it is the popup, not the fallback: ' + last.opened);
    ok(/U2AF1/.test('' + popup().textContent), 'built for the layer that was pressed');
    ok(/Grey out the other layers/.test('' + popup().textContent), 'with the greying row on it');
    close();

    // Away from any row, the press is left alone: a handler at the window in the capture
    // phase that consumed everything would break panning and selection.
    await press(600, 600);
    ok(!popup(), 'a press elsewhere opens nothing');
    ok(window.__bajaLayerRow.last.hit === false, 'and is not treated as a hit');

    // A SWALLOWED PRESS SAYS WHY. A menu painted on the canvas owns presses inside its own
    // bounds, which is right; a row that highlights, draws a chevron and then does nothing
    // when pressed is what a broken button looks like.
    g.said.length = 0;
    g.side_menu = { xoffset: 0, yoffset: 0, __bounds: () => ({ x: 0, y: 0, w: 400, h: 400 }) };
    await press(100, 126);
    ok(!popup(), 'with a menu over the row, the menu keeps the press');
    ok(window.__bajaLayerRow.last.menu === true, 'which is recorded');
    ok(/A menu is open over that layer row/.test(g.said.join(' ')),
       'and said, rather than leaving a button that looks broken: ' + g.said.join(' '));
    g.side_menu = null;

    // The same press arriving twice (pointerdown, then the compatibility mousedown) is one
    // press: the second must not re-open the menu it just opened.
    close();
    window.__bajaLayerRow.last = null;
    // Past the de-duplication window, so this counts as a new press rather than the tail of
    // the one above.
    await new Promise((r) => setTimeout(r, 300));
    window.dispatchEvent(new dom.window.MouseEvent('pointerdown', { clientX: 100, clientY: 126, button: 0, bubbles: true }));
    window.dispatchEvent(new dom.window.MouseEvent('mousedown', { clientX: 100, clientY: 126, button: 0, bubbles: true }));
    await new Promise((r) => setTimeout(r, 40));
    ok(!!popup(), 'the menu is open after a real press');
    ok(window.__bajaLayerRow.presses >= 1, 'and the duplicate was consumed rather than acted on twice');
    close();

    // The diagnostic is what a report of "it does nothing" is answered with, so it has to
    // carry the three things that decide it: the canvas, the rows, and the last press.
    const info = window.__bajaLayerRowInfo();
    ok(info.installed === true && info.connected === true, 'the diagnostic says the handler is live');
    ok(info.rows.length === 1 && /U2AF1/.test(info.rows[0].layer), 'which rows exist: ' + JSON.stringify(info.rows[0]));
    ok(!!info.last, 'and what the last press did');

    console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
