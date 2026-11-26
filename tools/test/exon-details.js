// WHAT THIS EXON IS, IN THE WINDOW EVERY OTHER RESULT USES.
//
//     node tools/test/exon-details.js          (needs jsdom)
//
// It went through the host's showModal with wid 'text-editor', so the answer to "what is
// this exon" arrived as four lines of plain text in a white sheet with line numbers down
// the side, as though it were a file being edited.
//
// And two menus carried their own copy of the arithmetic. One measured the exon as
// gxf - gxi and the other as abs(gxf - gxi) + 1, so the same exon was 121 nt in one menu
// and 122 in the other. Since the two differ by exactly one, an exon could be reported in
// frame by one menu and out of frame by the other, which is the only thing this popup is
// really for.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><canvas width="900" height="500"></canvas></body></html>',
    { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
// jsdom gives every element a zero rect; the panel picks the biggest VISIBLE canvas.
dom.window.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
    return { width: 900, height: 500, top: 20, left: 20, right: 920, bottom: 520, x: 20, y: 20 };
};
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const panel = () => document.getElementById('baja-exon-details');
const txt = () => (panel() || { textContent: '' }).textContent;
const graph = { said: [], setMessage(m) { this.said.push('' + m); } };
const show = (a) => load('baja/bio/exon-details.js', graph, { name: 'STMN2' }, a);

(async () => {
    // 122 inclusive bases: 79,611,000 to 79,611,121.
    await show({ name: 'ENSE00000936617.1', gxi: 79611000, gxf: 79611121, index: 2 });
    ok(!!panel(), 'it opens the standard result window, not a text editor sheet');
    ok(/ENSE00000936617\.1/.test(txt()), 'titled with the exon: ' + txt().slice(0, 30));
    ok(/122 nt/.test(txt()), 'LENGTH COUNTS BOTH ENDS: ' + (txt().match(/\d+ nt/) || [])[0]);
    ok(/out of frame/.test(txt()) && /2 bases over a multiple of three/.test(txt()),
       'and says how far out of frame, not just that it is: ' + txt().slice(0, 120));
    ok(/79,611,000/.test(txt()) && /79,611,121/.test(txt()), 'with the coordinates it was measured from');
    ok(/STMN2/.test(txt()), 'and which track it is on');

    // WHAT OUT OF FRAME DOES NOT SAY. It is a property of the exon's length, not a fault in
    // the transcript, and read without that it looks like a problem with the gene.
    ok(/if the exon were skipped/.test(txt()),
       'it says what the frame claim is about: ' + txt().slice(-150));

    // In frame, and the arithmetic that decides it.
    {
        document.getElementById('baja-exon-details').remove();
        await show({ name: 'e3', gxi: 1000, gxf: 1119 });     // 120 inclusive
        ok(/120 nt/.test(txt()) && /in frame/.test(txt()) && !/out of frame/.test(txt()),
           '120 inclusive bases is in frame: ' + txt().slice(0, 60));
    }
    // One base either way flips it, which is why the two old copies could disagree.
    {
        document.getElementById('baja-exon-details').remove();
        await show({ name: 'e4', gxi: 1000, gxf: 1118 });     // 119
        ok(/119 nt/.test(txt()) && /out of frame/.test(txt()), 'and 119 is not');
    }

    // A track-coordinate annotation with no genomic pair still works.
    {
        document.getElementById('baja-exon-details').remove();
        await show({ name: 'e5', xi: 300, xf: 389 });          // 90
        ok(/90 nt/.test(txt()) && /in frame/.test(txt()) && /on the track/.test(txt()),
           'track coordinates are measured the same way: ' + txt().slice(0, 60));
    }
    // And one with neither says so rather than reporting NaN nt.
    {
        document.getElementById('baja-exon-details').remove();
        const r = await show({ name: 'nothing' });
        ok(r === null && graph.said.some((m) => /no coordinates to describe/.test(m)),
           'an annotation with no coordinates is refused: ' + graph.said.slice(-1)[0]);
    }

    // ---- one implementation, and the host's sheet is gone --------------------------------
    for (const f of ['baja/manchester/menu/menu-factory.js', 'baja/manchester/menu/phylon-menu.js']) {
        const src = fs.readFileSync(f, 'utf8');
        ok(/exec\('baja\/bio\/exon-details\.js'/.test(src), f + ' asks the shared panel');
        const live = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
        ok(!/Exon is out of frame/.test(live), f + ' no longer builds the text itself');
        ok(!/'wid': 'text-editor'/.test(live) || !/Total length is/.test(live),
           f + ' no longer sends it to the text-editor modal');
    }

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
