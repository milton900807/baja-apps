// CTRL+S SAVES THE DOCUMENT, AND THE BROWSER'S "SAVE PAGE" NEVER OPENS.
//
//     node tools/test/ctrl-s-save.js
//
// The block that does this is lifted out of cpd/baja-analytics.js and run as it stands, with
// the things it reaches for stubbed: the address bar, the save module, the Save-as screen.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><input id="f"></body></html>', { url: 'https://gene.clinic/app/cpd/baja-analytics?path=/myfiles/beer%20companhy.bjb' });
global.window = dom.window; global.document = dom.window.document;
const AF = Object.getPrototypeOf(async function () { }).constructor;

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const src = fs.readFileSync('cpd/baja-analytics.js', 'utf8');
    const a = src.indexOf('const currentDocPath = () => {');
    const b = src.indexOf("file_items.push({\n                label: 'Save',", a);
    ok(a > 0 && b > a, 'the save block is where it is expected');
    const block = src.slice(a, b);

    const saves = [], said = []; let saveAs = 0, release = null, fail = null;
    const env = {
        location: dom.window.location, window: dom.window, path: '',
        pm: { plateTrack: { setMessage: (m) => said.push('' + m) } }, graph: {}, genegraph_panel_layout: {},
        saveAsSaveScreen: async () => { saveAs++; },
        exec: (p, g, l, pth, x, o) => { saves.push(o && o.path); if (fail) return Promise.reject(new Error(fail)); return new Promise((r) => { release = r; }); },
    };
    await new AF(...Object.keys(env), block)(...Object.values(env));

    const press = (init, target) => {
        const e = new dom.window.KeyboardEvent('keydown', Object.assign({ key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true }, init || {}));
        (target || document.body).dispatchEvent(e);
        return e;
    };

    // ---- the browser never gets it ----------------------------------------------------------
    let e = press();
    ok(e.defaultPrevented === true, 'Ctrl+S is stopped before the browser can open Save Page');
    await sleep(5);
    ok(saves.length === 1 && saves[0] === '/myfiles/beer companhy.bjb', 'and the document is saved over the file in the address bar: ' + saves[0]);
    ok(/Saving/.test(said.join(' ')), 'saying so');

    // ---- one save at a time -----------------------------------------------------------------
    e = press();
    await sleep(5);
    ok(e.defaultPrevented && saves.length === 1 && /Still saving/.test(said.join(' ')), 'a second press while it is writing does not start a second save, and says so');
    e = press({ repeat: true });
    ok(e.defaultPrevented && saves.length === 1, 'a held key repeating is still stopped, and saves nothing more');
    release(); await sleep(5);
    press(); await sleep(5);
    ok(saves.length === 2, 'once it has finished, Ctrl+S saves again');
    release(); await sleep(5);

    // ---- wherever it is pressed, however it is spelled ------------------------------------
    e = press({ ctrlKey: false, metaKey: true }); await sleep(5);
    ok(e.defaultPrevented && saves.length === 3, 'Cmd+S on a Mac is the same key');
    release(); await sleep(5);
    e = press({}, document.getElementById('f')); await sleep(5);
    ok(e.defaultPrevented && saves.length === 4, 'with the caret in a text field too');
    release(); await sleep(5);
    e = press({ key: 'ы' }); await sleep(5);
    ok(e.defaultPrevented && saves.length === 5, 'and on a keyboard layout where the S key types another letter');
    release(); await sleep(5);

    // ---- what it leaves alone ---------------------------------------------------------------
    e = press({ ctrlKey: false });
    ok(!e.defaultPrevented && saves.length === 5, 'a plain "s" is typing');
    e = press({ altKey: true });
    ok(!e.defaultPrevented, 'and Ctrl+Alt+S is someone else’s shortcut');

    // ---- it says when it fails --------------------------------------------------------------
    fail = 'disk is full';
    press(); await sleep(5);
    ok(/Could not save: disk is full/.test(said.join(' ')), 'a save that fails says why: ' + said[said.length - 1]);
    fail = null;
    press(); await sleep(5);
    ok(saves.length === 7, 'and does not leave the next save locked out');
    release(); await sleep(5);

    // ---- a document with no file yet goes to Save as ----------------------------------------
    dom.reconfigure({ url: 'https://gene.clinic/app/cpd/baja-analytics' });
    press(); await sleep(5);
    ok(saveAs === 1 && saves.length === 7, 'with no file to save over, it asks where to save');

    // ---- bound once -------------------------------------------------------------------------
    await new AF(...Object.keys(env), block)(...Object.values(env));     // the menubar rebuilt
    dom.reconfigure({ url: 'https://gene.clinic/app/cpd/baja-analytics?path=/myfiles/x.bjb' });
    press(); await sleep(5);
    ok(saves.length === 8, 'rebuilding the menus does not make one press save twice: ' + saves.length);

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
