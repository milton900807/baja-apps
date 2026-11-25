// NOTHING IS DRAWN THAT CANNOT BE FOUND IN THE SEQUENCE.
//
//     node tools/test/knowledge-placement.js
//
// A model asked about a region returns coordinates, and they look right. They are the one
// part of its answer that cannot be checked by reading it: two positions three kilobases
// apart are equally plausible on the page. Drawing them puts invented features on a canvas
// where everything else was measured, and nothing on screen says which is which.
//
// So a feature earns its place by its sequence, searched for in the stretch the user
// actually selected, and anything that cannot be found is reported rather than drawn.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// A stretch of "intron" with one distinctive 40-mer in it, at a known place.
const FILLER = 'ACGTTGCAATCGGATCAGGCATTAGCCATG';
const EXON2A = 'GTAAGTCCTTAGGACATTTCGGACCTAAGGTTCAGCATA';
const seq = FILLER.repeat(20) + EXON2A + FILLER.repeat(20);
const ORIGIN = 79611117;                       // the selection starts here
const WHERE = ORIGIN + FILLER.length * 20;     // where the 40-mer actually is

const place = (features, o) => load('baja/bio/knowledge/place-by-sequence.js', seq, ORIGIN, features, o || {});
const rc = (s) => s.split('').reverse().map((c) => ({ A: 'T', C: 'G', G: 'C', T: 'A' })[c]).join('');

(async () => {
    // ---- found once: drawn where its sequence is, not where it was said to be -----------
    {
        // A stated position is GENOMIC and `xi` is a track coordinate, so the two can only
        // be compared when the caller says which genomic base the selection starts at.
        const r = await place([{ label: 'cryptic exon 2a', kind: 'cryptic exon',
            what: 'included on TDP-43 loss', anchor: EXON2A,
            stated_start: WHERE + 2500,              // the model is 2.5 kb out
            evidence: { title: 'a paper', url: 'https://example.org/x' } }],
            { genomic_start: ORIGIN });
        ok(r.placed.length === 1 && r.unplaceable.length === 0, 'a feature whose sequence is here is placed');
        const p = r.placed[0];
        ok(p.xi === WHERE && p.xf === WHERE + EXON2A.length - 1,
           'AT ITS SEQUENCE, by coordinates this worked out: ' + p.xi + '-' + p.xf + ' (expected ' + WHERE + ')');
        ok(p.stated_start === WHERE + 2500 && p.stated_off_by === -2500,
           'with how far the source was out kept beside it: ' + p.stated_off_by);

        // WITHOUT THAT, NO DISTANCE IS CLAIMED. Subtracting a genomic position from a track
        // coordinate gives a number in the tens of millions, which would be printed beside
        // the feature as though it meant something.
        const bare = await place([{ label: 'same claim', anchor: EXON2A, stated_start: WHERE + 2500 }]);
        ok(bare.placed[0].stated_off_by === null && bare.placed[0].stated_start === WHERE + 2500,
           'the stated position is kept, the distance is not invented: '
           + JSON.stringify([bare.placed[0].stated_start, bare.placed[0].stated_off_by]));
        ok(p.evidence && p.evidence.url, 'and its citation carried through');
    }

    // ---- not found: reported, never drawn ------------------------------------------------
    {
        const r = await place([{ label: 'invented site', anchor: 'TTTTTCCCCCGGGGGAAAAATTTTTCCCCC' }]);
        ok(r.placed.length === 0 && r.unplaceable.length === 1, 'a sequence that is not here is not placed');
        ok(/not in the selected stretch/.test(r.unplaceable[0].why),
           'and says so by name: ' + r.unplaceable[0].label + ' -- ' + r.unplaceable[0].why);
    }

    // ---- the coding strand of a minus-strand gene ----------------------------------------
    {
        const r = await place([{ label: 'quoted the other way round', anchor: rc(EXON2A) }]);
        ok(r.placed.length === 1 && r.placed[0].xi === WHERE && r.placed[0].anchor_strand === -1,
           'a paper quoting the coding strand of a minus-strand gene still places: '
           + JSON.stringify(r.placed[0] && [r.placed[0].xi, r.placed[0].anchor_strand]));
    }

    // ---- AMBIGUOUS IS NOT PLACED ----------------------------------------------------------
    // "The fourth of the seven matches" is not something the source said.
    {
        const r = await place([{ label: 'common motif', anchor: FILLER }]);
        ok(r.placed.length === 0 && /occurs 40 times/.test(r.unplaceable[0].why),
           'a sequence that occurs many times is reported, not guessed at: ' + r.unplaceable[0].why);
    }

    // ---- A SHORT ANCHOR IS NOT AN ANCHOR --------------------------------------------------
    // GTAAGT occurs every few hundred bases; a match would say nothing.
    {
        const r = await place([{ label: 'just a splice donor', anchor: 'GTAAGT' },
                               { label: 'nothing at all', what: 'no sequence given' }]);
        ok(r.placed.length === 0 && r.unplaceable.length === 2, 'neither is placed');
        ok(/only 6 bases, too short/.test(r.unplaceable[0].why), 'the short one says why: ' + r.unplaceable[0].why);
        ok(/no sequence was given/.test(r.unplaceable[1].why), 'and so does the empty one');
    }

    // ---- a mixed answer is partly drawn and wholly accounted for --------------------------
    {
        const r = await place([
            { label: 'real', anchor: EXON2A },
            { label: 'hallucinated', anchor: 'GGGGGGGGGGGGCCCCCCCCCCCC' },
            // A stretch spanning the boundary, so it is unique the way a quoted exon with
            // its flank is unique.
            { label: 'real too', anchor: seq.slice(WHERE - ORIGIN - 20, WHERE - ORIGIN + 20) }
        ]);
        ok(r.counts.placed === 2 && r.counts.unplaceable === 1,
           'two of three are drawn and the third is named: ' + JSON.stringify(r.counts));
        ok(r.placed.length === 2 && r.placed[0].xi <= r.placed[1].xi,
           'and what is drawn comes back in order along the track');
    }

    // ---- lowercase, whitespace and line breaks out of a paper -----------------------------
    {
        const messy = EXON2A.toLowerCase().replace(/(.{10})/g, '$1\n  ');
        const r = await place([{ label: 'pasted from a PDF', anchor: messy }]);
        ok(r.placed.length === 1 && r.placed[0].xi === WHERE,
           'sequence as it comes out of a paper still matches: ' + JSON.stringify(r.counts));
    }

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
