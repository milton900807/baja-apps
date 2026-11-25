// THE EXON, THE MESSAGE AND THE PROTEIN IT WOULD MAKE.
//
//     node tools/test/alternative-peptide-view.js          (needs jsdom)
//
// A rank in a table says a site scores well. It does not say whether using it would add
// thirty residues to the protein or destroy it, and those are the two outcomes anyone
// cares about.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' }; window.innerWidth = 1430; window.innerHeight = 900;
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const el = () => document.getElementById('baja-alt-peptide-view');
const txt = () => (el() || { textContent: '' }).textContent;
const rects = () => Array.from(el().querySelectorAll('rect'));

const A = (n) => 'A'.repeat(n);
const NORMAL = 'M' + A(140) + A(100);
const MODEL = {
    ok: true, track: 'STMN2', plus: true,
    acceptor: { x: 79620500, intron: 1, lo: 79611500, hi: 79634000 },
    normal: { peptide: NORMAL, length: NORMAL.length,
        exons: [{ xi: 79611117, xf: 79611420 }, { xi: 79634001, xf: 79634300 }] },
    pairings: [
        { donorX: 79620591, donorScore: 0.81, exon: { xi: 79620501, xf: 79620590, length: 90, frame: 0 },
          peptide: 'M' + A(140) + 'W'.repeat(30) + A(100), length: 271, nmd: 'escapes',
          consequence: 'in frame: 30 residues inserted', divergeAt: 141, sameTail: 100 },
        { donorX: 79620593, donorScore: 0.62, exon: { xi: 79620501, xf: 79620592, length: 92, frame: 2 },
          peptide: 'M' + A(140) + 'RQLW', length: 145, nmd: 'nmd',
          consequence: 'frameshift to a premature stop that NMD would find',
          divergeAt: 141, sameTail: 0 }
    ]
};

(async () => {
    const v = await load('baja/bio/splicing/alternative-peptide-view.js', MODEL);
    ok(!!v && !!el(), 'the window opens');
    ok(/If the acceptor at 79,620,500 were used/.test(txt()), 'saying what it is supposing');

    // THE ONE SENTENCE THAT KEEPS THIS HONEST. The whole window is a conditional, and a
    // picture this concrete reads as a finding unless it says otherwise where it is read.
    ok(/Nothing here says it does/.test(txt()), 'and that nothing here says the site is used');
    ok(/best-scoring of 2 the model offers/.test(txt()),
       'including that the donor was a choice among several: ' + txt().slice(0, 60));

    // ---- three bands, in the order the claim is built ------------------------------------
    for (const w of ['THE INTRON, AND THE EXON IT WOULD MAKE', 'THE MESSAGE, EXON BY EXON', 'THE PROTEIN']) {
        ok(txt().toUpperCase().indexOf(w) >= 0, 'band: ' + w.toLowerCase());
    }
    ok(/Spliced, so the exons are end to end/.test(txt()),
       'the message band says it is in spliced coordinates, which is a different axis');

    // A MARK TOO SMALL TO SEE IS NOT A MARK: 90 nt in a 22 kb intron is four pixels.
    const exonRect = rects().filter((r) => /4ade80/.test(r.getAttribute('stroke') || ''))[0];
    ok(exonRect && +exonRect.getAttribute('width') >= 10,
       'the proposed exon is wide enough to see: ' + (exonRect && exonRect.getAttribute('width')));
    // And its two labels, at nearly the same x, do not print on top of each other.
    ok(/acceptor · donor 0\.81, 90 nt apart/.test(txt()),
       'the acceptor and donor labels combine when they would collide: ' + txt().slice(0, 40));

    // ---- THE PART THAT RESUMES IS NOT NEW --------------------------------------------------
    // An in-frame insertion shifts every residue after it, so comparing position by
    // position calls the whole downstream half different when only the insert is.
    {
        const t = txt();
        ok(/30 residues inserted at 141, then the same protein again/.test(t),
           'an in-frame insertion is drawn as an insertion: ' + t.slice(t.indexOf('residues') - 20, t.indexOf('residues') + 60));
        const blue = rects().filter((r) => /7dd3fc/.test(r.getAttribute('stroke') || ''));
        ok(blue.length >= 2, 'with known protein on BOTH sides of it: ' + blue.length + ' blue blocks');
    }

    // The frameshift is the other outcome, and it is drawn as the other outcome.
    {
        el().querySelector('tr[data-pair="1"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
        const t = txt();
        ok(/frameshift to a premature stop/.test(t), 'the other donor is a frameshift: ' + t.slice(0, 80));
        ok(/residue 141 onwards/.test(t) && !/then the same protein again/.test(t),
           'and nothing resumes, so everything after the divergence is marked');
        const red = rects().filter((r) => /f87171/.test(r.getAttribute('stroke') || ''));
        ok(red.length === 1, 'in red rather than green: ' + red.length);
    }

    // ---- stepping, and closing ---------------------------------------------------------
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    ok(/in frame: 30 residues inserted/.test(txt()), 'the arrow keys step between pairings');
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok(!el(), 'Escape closes it');
    ok(await load('baja/bio/splicing/alternative-peptide-view.js', { ok: true, pairings: [] }) === null,
       'and nothing is drawn when there is no pairing to draw');

    // ---- the arc is what opens it --------------------------------------------------------
    {
        const view = fs.readFileSync('baja/bio/splicing/acceptor-candidates-view.js', 'utf8');
        ok(/addMouseDownListener/.test(view) && /alternative-exon\.js/.test(view),
           'clicking the layer asks what the site would make');
        ok(/track\.track_layers\.indexOf\(layer\) < 0\) return;/.test(view),
           'only while this layer is on the track');
        ok(/graph\.track\[ti\] !== track\) return;/.test(view), 'only inside this track');
        ok(/if \(!hit\) return;/.test(view),
           'and only near a candidate: a layer that eats clicks takes selection with it');
        ok(/Click an /.test(view) && /arc to see the exon, the message and the protein/.test(view),
           'and the closing message says the arcs can be clicked');
    }

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
