// A MAILBOX AS A SOURCE OF DATES.
//
//     node tools/test/gmail.js
//
// The refresh token is the mailbox: whoever holds it can read that mail until it is revoked.
// So the thing worth testing hardest is what the browser is never given, and what the server
// never writes down twice.
//
// The client ops are run against a stubbed server; the server file is read for the
// properties that cannot be tested without Google at the other end.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: 'https://api.gene.clinic' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let posts = [], gets = [], server = {}, opened = null, inner = null;
const POST = async (body, url) => { posts.push({ url, body }); return server[url] || null; };
const GET = async (url) => { gets.push(url); return server[url.split('?')[0]] || null; };
// core.js defines getUser() over any global of that name, and it asks lion_engine, so the
// identity is given where core actually looks for it.
const WHO = 'jeff@violetresearch.org';
window.open = (url, name) => {
    opened = { url, name };
    inner = { closed: false };
    return inner;
};

const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const src = fs.readFileSync(path, 'utf8');
    const f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {});
    return f(...a);
};
// core.js defines POSTJSON and GETJSON over any global of those names and routes both
// through lion_engine, so the stubs go there.
const engine = (over) => Object.assign({ getUser: () => WHO, GETJSON: GET, POSTJSON: POST,
    exec: (p, ...a) => load(p, ...a) }, over || {});
global.lion_engine = engine();

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const A = 'https://api.gene.clinic';

(async () => {
    const said = [];
    const pt = { setMessage: (m) => said.push('' + m), wake() { } };

    // ---- status -------------------------------------------------------------------------
    server[A + '/gmail/status'] = { connected: true, mailbox: 'jeff@violetresearch.org' };
    let r = await load('baja/plate/ops/gmail-connect.js', pt, { what: 'status' });
    ok(r.connected === true && r.mailbox === 'jeff@violetresearch.org',
       'status comes from the server: ' + JSON.stringify(r));
    ok(/user=jeff%40violetresearch\.org/.test(gets[0]), 'asked for this user');

    // ---- connecting ----------------------------------------------------------------------
    server[A + '/gmail/status'] = { connected: false };
    server[A + '/gmail/start'] = { url: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc', state: 'abc' };
    posts = []; opened = null;
    const connecting = load('baja/plate/ops/gmail-connect.js', pt, {});
    await new Promise((d) => setTimeout(d, 20));
    ok(!!opened && /accounts\.google\.com/.test(opened.url), 'a consent window opens at Google');
    ok(opened.name === 'baja-gmail', 'in its own window');
    // the server says yes afterwards, which is what decides it
    server[A + '/gmail/status'] = { connected: true, mailbox: 'jeff@violetresearch.org' };
    window.postMessage({ source: 'baja-gmail', ok: true }, '*');
    r = await connecting;
    ok(r.connected === true, 'and the connection is confirmed: ' + JSON.stringify(r));
    ok(posts[0].url === A + '/gmail/start', 'the URL was asked of the server, not built here');

    // the window's word is not the answer: the server's record is
    server[A + '/gmail/status'] = { connected: false };
    posts = []; opened = null;
    const lying = load('baja/plate/ops/gmail-connect.js', pt, {});
    await new Promise((d) => setTimeout(d, 20));
    window.postMessage({ source: 'baja-gmail', ok: true }, '*');
    r = await lying;
    ok(!!r.error && !r.connected,
       'a window that claims success while the server kept nothing is not a connection: ' + r.error);

    // ---- reading mail -----------------------------------------------------------------------
    server[A + '/gmail/status'] = { connected: true, mailbox: 'jeff@violetresearch.org' };
    server[A + '/gmail/messages'] = { connected: true, count: 2, messages: [
        { id: '1', subject: 'Board', from: 'a@b.com', sent: '2026-11-10T09:00:00.000Z', text: 'Board meets on the 18th.' },
        { id: '2', subject: 'Trip', from: 'c@d.com', sent: '2026-03-03T09:00:00.000Z', text: 'Flying out tomorrow for three days.' }] };

    let handed = null;
    const realLoad = load;
    global.lion_engine = engine({
        exec: async (p, ...a) => {
            if (p === 'baja/plate/ops/text-to-timeline.js') { handed = a[1]; return { timeline: 'test', added: 2 }; }
            return realLoad(p, ...a);
        } });
    posts = [];
    r = await realLoad('baja/plate/ops/gmail-to-timeline.js', pt, { query: 'from:board newer_than:30d', max: 10 });
    ok(!r.error && r.added === 2, 'the mail is read and handed on: ' + JSON.stringify(r));
    ok(posts[0].body.query === 'from:board newer_than:30d' && posts[0].body.max === 10,
       'the search goes through as asked');
    ok(/Sent: 2026-11-10/.test(handed.text) && /Sent: 2026-03-03/.test(handed.text),
       'each message carries the day it was sent, so "tomorrow" means the day after THAT');
    ok(/--- MESSAGE ---/.test(handed.text), 'and they are separated, not run together');
    ok(handed.sent === null, 'with no single sent date for the lot');

    // nothing matched is said rather than handed on as empty text
    server[A + '/gmail/messages'] = { connected: true, count: 0, messages: [] };
    handed = null;
    r = await realLoad('baja/plate/ops/gmail-to-timeline.js', pt, { query: 'from:nobody' });
    ok(!!r.error && /no mail matched/.test(r.error) && handed === null,
       'nothing matched is said and nothing is read: ' + r.error);

    // access taken away is said in words, with what to do
    server[A + '/gmail/messages'] = { error: 'access_revoked' };
    r = await realLoad('baja/plate/ops/gmail-to-timeline.js', pt, {});
    ok(!!r.error && /no longer shared/.test(r.error), 'a revoked mailbox says so: ' + r.error);

    global.lion_engine = engine();

    // ---- what the client never handles ------------------------------------------------------
    const cc = fs.readFileSync('baja/plate/ops/gmail-connect.js', 'utf8');
    const gt = fs.readFileSync('baja/plate/ops/gmail-to-timeline.js', 'utf8');
    for (const [name, src] of [['gmail-connect', cc], ['gmail-to-timeline', gt]]) {
        ok(!/refresh_token|client_secret|access_token/.test(src),
           name + ' never touches a token or a secret');
    }
    ok(!/accounts\.google\.com/.test(cc),
       'and does not build the consent URL itself: the state in it is minted by the server');

    // ---- the server, where the token lives ---------------------------------------------------
    const srv = fs.readFileSync('/home/claude/baja-server/src/index.ts', 'utf8');
    const k = srv.indexOf('GMAIL, READ ONLY');
    ok(k > 0, 'the server has the Gmail endpoints');
    const block = srv.slice(k, srv.indexOf("app.post(['/oidc/token'", k));

    ok(/createCipheriv\('aes-256-gcm'/.test(block), 'the refresh token is encrypted at rest');
    ok(/mode: 0o600/.test(block), 'in a file only the server can read');
    ok(!/res\.json\([^)]*refresh/.test(block), 'and never returned by any endpoint');
    ok(/__gmailStates\.delete\(state\);\s*\/\/ spent/.test(block), 'the consent state is spent once');
    ok(/Date\.now\(\) - pending\.ts > 10 \* 60 \* 1000/.test(block), 'and expires');
    ok(/const state = crypto\.randomBytes\(24\)/.test(block),
       'the state is minted on the server, so the window that returns is tied to who opened it');
    ok(/access_type: 'offline', prompt: 'consent'/.test(block),
       'offline + consent, which is what makes Google hand over a refresh token at all');
    ok(/gmail\.readonly/.test(block), 'the scope asked for is read-only');
    ok(/invalid_grant/.test(block) && /delete all\[canonicalUserEmail\(email\)\]/.test(block),
       'a refresh Google refuses clears the record rather than failing the same way for ever');
    ok(/oauth2\.googleapis\.com\/revoke/.test(block),
       'disconnecting tells Google as well, not just this side');
    ok(/newer_than:14d/.test(block), 'the default search is recent mail, not a mailbox');
    ok(/max = Math\.min\(max, 50\)/.test(block), 'with a cap on how much is read');
    ok(/no token, no code and no address in this page/i.test(block),
       'and the page Google returns to carries nothing of value');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
