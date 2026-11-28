// AN OUT-OF-FRAME EXON SAYS WHAT WOULD HAPPEN.
//
//     node tools/test/exon-details-consequence.js          (needs jsdom)
//
// "Out of frame" is a fact about the exon's length, and it stops exactly where the
// reader's question begins: a shifted frame runs to some stop codon, and whether that stop
// reads as a premature one is the difference between a truncated protein and almost none.
// The editor already works that out for the exon menu, so the page asks it rather than
// growing a second answer, and this checks that it is the SAME answer.
const fs = require('fs');
const { JSDOM } = require('jsdom');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };

const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
let IMPACT = null, ASKED = null;
const load = async (p, ...a) => {
    if (/exon-removal-impact\.js$/.test(p)) { ASKED = { track: a[0], exon: a[1] }; return IMPACT; }
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

const said = [];
const graph = { setMessage: (m) => said.push(m), setResultMessage: (m) => said.push(m) };
const track = { name: 'DNM1', xi: 1, xf: 9000, annotations: [], track_layers: [] };
const exon = (len, i) => ({ type: 'Exon', name: 'ENSE000036745' + (i || 13), index: (i || 17),
    gxi: 128247375, gxf: 128247375 + len - 1, xi: 1000, xf: 1000 + len - 1 });

const show = async (a) => {
    try { const old = document.getElementById('baja-exon-details'); if (old) old.remove(); } catch (e) { }
    await load('baja/bio/exon-details.js', graph, track, a);
    const el = document.getElementById('baja-exon-details');
    return el ? el.textContent : '';
};

(async () => {
    // ---- OUT OF FRAME: THE CONSEQUENCE IS WORKED OUT -------------------------------------
    IMPACT = {
        ok: true, outcome: 'frameshift', nmd: 'nmd',
        headline: 'Frameshift: a stop codon now falls after 412 aa (was 864). This is a '
            + 'premature termination codon (PTC) and the mRNA is predicted to undergo NMD: '
            + 'little protein expected.',
        lines: ['the new stop is 1,204 nt upstream of the last junction',
                'the 50 to 55 nt rule marks it for decay']
    };
    let text = await show(exon(112));
    ok(/out of frame/.test(text), 'the page still says the exon is out of frame');
    ok(ASKED && ASKED.exon && ASKED.track === track,
       'and asks the editor what skipping it would do');
    ok(/If this exon were skipped/.test(text), 'which is on the page: ' + /If this exon were skipped/.test(text));
    ok(/premature termination codon/.test(text), 'with the consequence in the words the exon menu uses');
    ok(/50 to 55 nt rule/.test(text), 'and the reasoning under it');
    ok(/frameshift/.test(text) && /nmd/.test(text), 'summarised in a row of its own too');
    // WHAT IT RESTS ON, said plainly: a rule of thumb over a translation is not a
    // measurement, and a reader who takes it for one has been misled by this page.
    ok(/prediction about the isoform, not a measurement/.test(text),
       'and what the number is NOT');

    // ---- IN FRAME: NOTHING IS RUN ----------------------------------------------------------
    // The skip is an internal deletion, the page already says so, and a paragraph of
    // consequence under every exon somebody clicks is noise.
    ASKED = null;
    text = await show(exon(111));
    ok(/in frame/.test(text), 'a multiple of three is still reported in frame');
    ok(ASKED === null, 'and nothing is calculated for it');
    ok(!/If this exon were skipped/.test(text), 'so the page stays short');

    // ---- WHEN IT CANNOT BE WORKED OUT ------------------------------------------------------
    // Saying nothing leaves the reader thinking the question was not worth asking.
    IMPACT = { ok: false, reason: 'no start codon on this transcript' };
    text = await show(exon(112));
    ok(/not worked out/.test(text) && /no start codon/.test(text),
       'a transcript it cannot translate says why: ' + /no start codon/.test(text));
    IMPACT = null;
    text = await show(exon(112));
    ok(/not worked out/.test(text), 'and so does a calculation that fell over');

    // ---- ONE ANSWER, NOT TWO ----------------------------------------------------------------
    const page = fs.readFileSync('baja/bio/exon-details.js', 'utf8');
    ok(/exon-removal-impact\.js/.test(page),
       'the page calls the module the exon menu calls, rather than translating anything itself');
    // No translator of its own: the only codon in the file is the word in the sentence
    // that tells the reader where the answer came from.
    const code = page.replace(/\/\/[^\n]*/g, '');
    ok(!/ATG|translate\(|CODON|charCodeAt/.test(code),
       'and carries no translation of its own to disagree with it');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
