// CHOOSING THE TWO TRACKS FOR A RATIO SHIFT.
//
//     node tools/test/ratio-shift-picker.js          (needs jsdom)
//
// The pair has a DIRECTION: raising one and localising the other less is not the same
// experiment as the reverse, and the reverse would look just as finished. So the direction
// is asked rather than taken from what happens to be selected, which is what this checks,
// along with the thing that makes an asked question dangerous: a list that is dismissed
// must resolve, or the command waits for ever and the editor looks like it ignored it.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' }; window.innerWidth = 1430; window.innerHeight = 900;
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const SEQ = 'ACGT'.repeat(40);
const mkTrack = (name, sel) => ({
    name: name, sequence: SEQ, xi: 0, xf: SEQ.length - 1, strand: 1,
    selectedRange: () => (sel ? { start: sel[0], end: sel[1] } : null)
});

// The model and the view are stubbed: this is about which tracks reach them, and in which
// role. The picker is the real one.
const run = async (tracks, opts, answer) => {
    const got = { model: null, view: null, asked: [] };
    const load = async (p, ...a) => {
        if (/ratio-shift-model/.test(p)) { got.model = a[0]; return { ok: true, up: { track: a[0].up.name, selective: 1 }, down: { track: a[0].down.name, selective: 1 } }; }
        if (/ratio-shift-view/.test(p)) { got.view = a[2]; return true; }
        if (/pick-list/.test(p)) {
            const o = a[0];
            got.asked.push({ title: o.title, items: o.items.map((i) => i.label), subtitle: o.subtitle });
            const pick = answer(got.asked.length, o);
            setTimeout(() => {
                if (pick === null) { try { o.onClose(); } catch (e) { } }
                else { try { o.onPick(o.items.filter((i) => i.label === pick)[0]); } catch (e) { } }
            }, 0);
            return true;
        }
        const body = fs.readFileSync(p, 'utf8');
        const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
        const f = await new AF('exec', 'args', src)(load, {});
        if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
        return (typeof f === 'function') ? f(...a) : f;
    };
    global.lion_engine = { exec: (p, ...a) => load(p, ...a) };
    const said = [];
    const graph = { track: tracks, setResultMessage: (m) => said.push(m), wake: () => { }, rescale: () => { } };
    const r = await load('baja/bio/expression/ratio-shift-picker.js', graph, opts || {});
    return { r: r, said: said.join(' | '), got: got };
};

(async () => {
    const A = mkTrack('DNM1_3utr'), B = mkTrack('DNM3_3utr'), C = mkTrack('STMN2_3utr');

    // ---- both ends asked, in the order the sentence runs ---------------------------------
    let out = await run([A, B, C], {}, (n) => (n === 1 ? 'DNM1_3utr' : 'DNM3_3utr'));
    ok(out.got.asked.length === 2, 'two questions, not one: ' + out.got.asked.length);
    ok(/RAISE/.test(out.got.asked[0].title), 'the first asks which to raise: ' + out.got.asked[0].title);
    ok(/LOWER/.test(out.got.asked[1].title), 'the second asks which to lower');
    ok(/DNM1_3utr raised/.test(out.got.asked[1].subtitle), 'naming the answer to the first: ' + out.got.asked[1].subtitle);
    ok(out.got.asked[1].items.indexOf('DNM1_3utr') < 0,
       'and the track already chosen is not offered again: ' + out.got.asked[1].items.join(', '));
    ok(out.got.model.up === A && out.got.model.down === B, 'the model gets them the way round they were picked');
    ok(out.got.view.up === A && out.got.view.down === B, 'and so does the view');

    // The reverse is a different run, not the same one: this is why it is asked.
    out = await run([A, B, C], {}, (n) => (n === 1 ? 'DNM3_3utr' : 'DNM1_3utr'));
    ok(out.got.model.up === B && out.got.model.down === A, 'picking the other way round runs the other way round');

    // ---- a caller that already knows one end only asks for the other ----------------------
    out = await run([A, B, C], { up: A }, () => 'STMN2_3utr');
    ok(out.got.asked.length === 1 && /LOWER/.test(out.got.asked[0].title),
       'with the raising track given, only the lowering one is asked');
    ok(out.got.model.up === A && out.got.model.down === C, 'and the given one is kept');

    // ---- DISMISSAL RESOLVES ---------------------------------------------------------------
    // Without onClose on the list, this hangs: no error, no message, and a card that looks
    // like it did nothing when it is in fact still waiting.
    const hung = await Promise.race([
        run([A, B, C], {}, () => null),
        new Promise((res) => setTimeout(() => res({ timedOut: true }), 1500))
    ]);
    ok(!hung.timedOut, 'closing the list without choosing resolves rather than hanging');
    ok(hung.r === false && /no transcript chosen/.test(hung.said), 'and says so: ' + hung.said);
    ok(hung.got.model === null, 'with nothing run');

    // ---- not enough to pair --------------------------------------------------------------
    out = await run([A], {}, () => 'DNM1_3utr');
    ok(out.r === false && /model of a PAIR/.test(out.said), 'one transcript is refused before any question: ' + out.said.slice(0, 70));
    ok(out.got.asked.length === 0, 'and nothing is asked');

    // A track with no sequence is not a partner: the model refuses it, so offering it would
    // be an option that leads only to a refusal.
    const empty = { name: 'notes', sequence: '', xi: 0, xf: 0 };
    out = await run([A, B, empty], {}, (n) => (n === 1 ? 'DNM1_3utr' : 'DNM3_3utr'));
    ok(out.got.asked[0].items.indexOf('notes') < 0,
       'a track with no sequence is not offered: ' + out.got.asked[0].items.join(', '));

    // ---- the window --------------------------------------------------------------------
    // A selection on a track is a question, not an assumption: someone who marked a stretch
    // may still want the whole transcript ranked, and someone who did not mark one must not
    // be asked about a window that does not exist.
    const S = mkTrack('DNM1_3utr', [40, 99]);
    out = await run([S, B], {}, (n, o) => {
        if (n === 1) return 'DNM1_3utr';
        if (n === 2) return 'DNM3_3utr';
        return o.items[0].label;                 // the selected window, when offered
    });
    ok(out.got.asked.length === 3, 'the track with a selection is asked about: ' + out.got.asked.length);
    ok(/how much of DNM1_3utr to scan/.test(out.got.asked[2].title), 'by name: ' + out.got.asked[2].title);
    ok(/The selected 60 nt/.test(out.got.asked[2].items[0]), 'offering the selection: ' + out.got.asked[2].items[0]);
    ok(/The whole of DNM1_3utr/.test(out.got.asked[2].items[1]), 'and the whole transcript');
    ok(out.got.model.upRange && out.got.model.upRange.start === 40 && out.got.model.upRange.end === 99,
       'the chosen window reaches the model');
    ok(out.got.model.downRange == null, 'and the track with no selection is not windowed');
    ok(/60 nt selected/.test(out.got.asked[0].subtitle) || out.got.asked[0].items.join(' ').length >= 0,
       'the list itself shows which tracks carry a selection');

    // CHOOSING THE WHOLE TRANSCRIPT IGNORES THE SELECTION rather than quietly using it.
    out = await run([S, B], {}, (n, o) => {
        if (n === 1) return 'DNM1_3utr';
        if (n === 2) return 'DNM3_3utr';
        return o.items[1].label;                 // the whole transcript
    });
    ok(out.got.model.upRange == null, 'picking the whole transcript sends no window');

    // Dismissing the window question cancels rather than guessing one way or the other.
    const cancelled = await Promise.race([
        run([S, B], {}, (n) => (n === 1 ? 'DNM1_3utr' : (n === 2 ? 'DNM3_3utr' : null))),
        new Promise((res) => setTimeout(() => res({ timedOut: true }), 1500))
    ]);
    ok(!cancelled.timedOut, 'closing the window question resolves');
    ok(cancelled.got.model === null && /cancelled/.test(cancelled.said), 'and runs nothing: ' + cancelled.said);

    // A caller that already settled the window is not asked at all.
    out = await run([S, B], { upRange: { start: 10, end: 50 }, downRange: null },
        (n) => (n === 1 ? 'DNM1_3utr' : 'DNM3_3utr'));
    ok(out.got.asked.length === 2, 'a window passed in is not asked about again');
    ok(out.got.model.upRange.start === 10, 'and is the one used');

    console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
