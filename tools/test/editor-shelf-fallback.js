// A SHELF BEATS A REFUSAL.
//
//     node tools/test/editor-shelf-fallback.js
//
// "run ml motilf" answered "Nothing in the editor does that", with a note that the name is
// not one of the four models. Both true, and neither is an answer: the request is plainly
// about running a model and there is a shelf of them one click away. open_library exists for
// this and the planner is told to reach for it, but a planner is a reading of a sentence, and
// a misread used to leave the user at a dead end.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>',
    { url: 'https://gene.clinic/', pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
window.env = { apiUrl: 'https://gene.clinic' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const opened = [];          // which library modules were exec'd
let planReply = null;       // what the planner answers

const load = async (p, ...a) => {
    if (('' + p).indexOf('/py/bio/editor/plan.py') >= 0) return planReply;
    if (/librar/i.test('' + p) || /institute-rna-design/.test('' + p)) {
        opened.push('' + p); return { ok: true };
    }
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };
process.on('unhandledRejection', (e) => { console.log('UNHANDLED:', (e && e.stack) || e); process.exit(1); });
process.on('exit', (c) => { if (c === 0 && !done) console.log('EXITED EARLY before assertions ran'); });
let done = false;

const mkGraph = () => ({
    tracks: [], m_tracks: [], root: [],
    setMessage: () => { }, setResultMessage: () => { },
    getTracks: () => [], wake: () => { }
});

// One trip through the card: type the request, let the planner answer, read what came back.
const ask = async (text, reply) => {
    planReply = reply;
    opened.length = 0;
    const host = document.createElement('div');
    document.body.appendChild(host);
    // NOT AWAITED. With a host and a prefill the card renders, runs the request and then
    // stays up waiting for the user; its promise is not a signal that the answer has
    // arrived. What is waited for is the answer appearing on screen, which is the thing
    // under test anyway.
    load('baja/manchester/menu/editor-command.js', mkGraph(), {}, { host: host, prefill: text });
    for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 25));
        if (opened.length) break;
        const out = host.querySelector('#ec-out');
        if (out && out.innerHTML) break;
    }
    await new Promise((r) => setTimeout(r, 80));
    return { host: host, text: (host.textContent || ''), opened: opened.slice() };
};

(async () => {
    // What the planner actually returned for "run ml motilf".
    const refusal = {
        status: 'OK', steps: [], problems: [],
        unsupported: ['run ml motilf - this appears to be a typo or refers to a model not in '
            + 'the catalogue; available ML models are BajaCLIP (RBP binding), SpliceNet '
            + '(splice sites), PSINet (exon inclusion), and djPrimer']
    };

    let r = await ask('run ml motilf', refusal);
    ok(r.opened.some((p) => /ml\/models-library/.test(p)),
       'a model name it cannot place opens the shelf of models: ' + JSON.stringify(r.opened));
    ok(!/Nothing in the editor does that/.test(r.text),
       'and the dead end is gone');
    ok(/shelf it would be on/i.test(r.text),
       'with a line saying why a library appeared: ' + r.text.replace(/\s+/g, ' ').slice(0, 120));
    ok(/not in the catalogue|available ML models/i.test(r.text),
       'the planner\'s own words are kept, since that is the part the user got wrong');

    // The user's words are read first: the planner may say nothing useful at all.
    r = await ask('run the binding model on this', { status: 'OK', steps: [], unsupported: [] });
    ok(r.opened.some((p) => /ml\/models-library/.test(p)),
       'the request alone is enough, with no help from the planner');

    // Other shelves, same rule.
    for (const [text, want] of [
        ['load some phylop conservation data', /data-resources-library|data-loading/],
        ['what modalities are there for this', /institute-rna-design/],
        ['draw an arrow here', /draw-tools-library/]
    ]) {
        r = await ask(text, { status: 'OK', steps: [], unsupported: [] });
        ok(r.opened.some((p) => want.test(p)),
           JSON.stringify(text) + ' goes to its own shelf: ' + JSON.stringify(r.opened));
    }

    // AND NOT ALWAYS. A request with nothing to do with any shelf still gets the honest
    // refusal: opening a library for everything would make the shelf meaningless.
    r = await ask('export all of this to a spreadsheet and email it', {
        status: 'OK', steps: [], unsupported: ['exporting to a spreadsheet']
    });
    ok(!r.opened.length, 'nothing is opened for a request no shelf covers: ' + JSON.stringify(r.opened));
    ok(/Nothing in the editor does that/.test(r.text),
       'and it says so plainly: ' + r.text.replace(/\s+/g, ' ').slice(0, 90));

    // ---- the planner is told the same thing ---------------------------------------------
    const plan = fs.readFileSync('py/bio/editor/plan.py', 'utf8');
    ok(/A NAME YOU CANNOT PLACE IS THE STRONGEST REASON TO OPEN THE SHELF/.test(plan),
       'and the planner is told to reach for the shelf itself, so the fallback is a safety '
       + 'net rather than the normal path');

    done = true;
    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
