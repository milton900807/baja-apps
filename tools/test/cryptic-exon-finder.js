// THE CRYPTIC EXON FINDER IS IN THE CATALOGUE, AND THERE IS ONE OF IT.
//
//     node tools/test/cryptic-exon-finder.js
//
// It could only be reached by right-clicking an exon: Exon -> AI Models -> Phylon ->
// Human or Mouse. The models catalogue lists every splicing model, so it listed every
// splicing model but this one, and from the catalogue the tool looked lost.
//
// Moving it to the catalogue meant one of two things: a second copy of "run the script,
// turn the hits into annotations, add them to the track", or one module both callers use.
// The first is how two answers to one question start.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let ran = null, reply = { hits: [] }, made = [], failed = [];
const load = async (p, ...a) => {
    if (/cryptic-exon-finder(-mm9)?\.py$/.test('' + p)) { ran = { script: '' + p, args: a }; return reply; }
    if (/splicing\/cryptic-exons$/.test('' + p)) {
        return { generateCrypticExons: (r, o) => { made.push({ r: r, o: o }); return (r && r.hits) || []; } };
    }
    if (/working\.js$/.test('' + p)) return { step() { }, done() { }, fail(m) { failed.push('' + m); } };
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const mkTrack = (o) => Object.assign({
    name: 'T', chr: '9', strand: 1, species: 'human', added: [],
    markstart: null, markend: null,
    getSequenceRange(a, b) { return 'ACGT'.repeat(Math.max(1, Math.ceil((b - a) / 4))); },
    add(x) { this.added.push(x); }
}, o || {});
const mkGraph = () => ({ said: [], results: [],
    setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.results.push('' + m); },
    wake() { } });
const run = (g, t, reg, o) => { failed = []; return load('baja/bio/splicing/cryptic-exon-finder.js', g, t, reg, o || {}); };

(async () => {
    // ---- the window it is given ----------------------------------------------------------
    {
        ran = null; made = []; reply = { hits: [{ xi: 10, xf: 90 }, { xi: 200, xf: 260 }] };
        const g = mkGraph(), t = mkTrack();
        const r = await run(g, t, { xi: 1000, xf: 3000 });
        ok(!!ran, 'the script runs');
        ok(/cryptic-exon-finder\.py$/.test(ran.script), 'the human one for a human track: ' + ran.script);
        ok(ran.args[1] === '9' && ran.args[2] === 1000 && ran.args[3] === 3000,
           'over the window it was given: ' + JSON.stringify(ran.args.slice(1, 5)));
        ok(made.length === 1 && made[0].o.xiAnchor === 1000,
           'and the hits are anchored where the window starts, not at zero: ' + JSON.stringify(made[0] && made[0].o));
        ok(t.added.length === 2, 'every candidate is added to the track: ' + t.added.length);
        ok(r && r.added === 2, 'and reported back: ' + JSON.stringify(r));
        ok(g.results.some((m) => /2 candidates added/.test(m)), 'with a line saying so: ' + g.results[0]);
    }

    // NONE IS A RESULT. Adding nothing and saying nothing reads exactly like a model that
    // never ran.
    {
        ran = null; reply = { hits: [] };
        const g = mkGraph(), t = mkTrack();
        await run(g, t, { xi: 1000, xf: 3000 });
        ok(t.added.length === 0 && g.results.some((m) => /nothing reached 0\.98/.test(m)),
           'nothing found is said out loud, WITH THE BAR IT DID NOT REACH: ' + g.results[0]);
    }

    // THE THRESHOLD IS THE WHOLE ANSWER when nothing comes back. "Nothing here" and
    // "nothing cleared 0.98" read the same on screen and are not the same finding; STMN2,
    // whose cryptic exon is the best known there is, comes back empty at 0.98 over all
    // 55 kb of it.
    {
        ran = null; reply = { hits: [], meta: { n_candidates_generated: 12480 } };
        const g = mkGraph(), t = mkTrack();
        const r = await run(g, t, { xi: 1000, xf: 3000 }, { threshold: 0.75 });
        ok(ran && ran.args[8] === 0.75, 'the threshold reaches the script: ' + JSON.stringify(ran.args.slice(5)));
        ok(ran.args[5] === 50 && ran.args[6] === 1000,
           'with the exon-length guardrails it expects in the arguments before it');
        ok(g.results.some((m) => /nothing reached 0\.75/.test(m)), 'and is named in the result');
        // HOW MANY WERE LOOKED AT separates "no usable motifs in this window" from
        // "thousands, none conserved enough", which otherwise read identically.
        ok(g.results.some((m) => /12,480 exon-like candidates scored/.test(m)),
           'along with how many candidates were scored: ' + g.results[0]);
        ok(r && r.threshold === 0.75 && r.candidates === 12480, 'and both come back: ' + JSON.stringify(r));
        reply = { hits: [] };
    }

    // ---- SPECIES PICKS THE SCRIPT ----------------------------------------------------------
    // The two read different genomes' conservation, so the wrong one scores mouse sequence
    // against human constraint and returns confident nonsense.
    {
        ran = null; reply = { hits: [] };
        await run(mkGraph(), mkTrack({ species: 'mouse' }), { xi: 10, xf: 500 });
        ok(/mm9\.py$/.test(ran.script), 'a mouse track gets the mm9 script: ' + ran.script);
        ran = null;
        await run(mkGraph(), mkTrack({ species: 'Mus musculus' }), { xi: 10, xf: 500 });
        ok(/mm9\.py$/.test(ran.script), 'however the species is written: ' + ran.script);
        ran = null;
        await run(mkGraph(), mkTrack({ species: 'human' }), { xi: 10, xf: 500 }, { species: 'mouse' });
        ok(/mm9\.py$/.test(ran.script), 'and the caller can still say which, as the menu does');
    }

    // ---- what it refuses, AND WHERE THE REFUSAL GOES -----------------------------------------
    // Reached from the models library, the canvas is behind a full-screen overlay when the
    // decision is made. A setMessage into that canvas is a button that does nothing, which
    // is exactly how this was reported.
    {
        ran = null;
        const g = mkGraph();
        await run(g, mkTrack(), {});
        ok(!ran && g.said.some((m) => /Select an exon or a stretch/.test(m)),
           'no window, no scan, and it says what to do: ' + g.said[0]);
        ok(failed.some((m) => /Select an exon or a stretch/.test(m)),
           'ON THE PANEL THAT SITS ABOVE EVERYTHING, not only on the covered canvas: '
           + JSON.stringify(failed));

        const g2 = mkGraph();
        await run(g2, mkTrack(), { xi: 0, xf: 400000 });
        ok(!ran && g2.said.some((m) => /400 kb/.test(m)) && failed.length === 1,
           'a span far too big to scan is refused with its size, visibly: ' + g2.said[0]);

        const g3 = mkGraph();
        await run(g3, { name: 'X', chr: '1', add() { } }, { xi: 10, xf: 500 });
        ok(!ran && failed.some((m) => /no sequence loaded/.test(m)),
           'a track with no sequence says that rather than throwing mid-scan: ' + JSON.stringify(failed));

        // An error from the script used to be handed to the annotation builder, which
        // found no hits in it, so a failure was reported as "nothing found".
        ran = null; reply = { error: 'bigWig not found' };
        const g4 = mkGraph();
        const r4 = await run(g4, mkTrack(), { xi: 10, xf: 500 });
        ok(r4 && r4.error && failed.some((m) => /bigWig not found/.test(m))
           && !g4.results.some((m) => /nothing over the threshold/.test(m)),
           'and an error from the script is an error, not an empty result: ' + JSON.stringify(failed));
        reply = { hits: [] };
    }

    // The conservation file downloads once, and that is not a result of zero.
    {
        ran = null; reply = { status: 'file_downloading' };
        const g = mkGraph(), t = mkTrack();
        const r = await run(g, t, { xi: 10, xf: 500 });
        ok(r && r.downloading && t.added.length === 0
           && g.said.some((m) => /downloading/.test(m)),
           'a first run says the file is coming rather than reporting nothing found: ' + g.said[0]);
    }

    // ---- one implementation, two entry points ------------------------------------------------
    {
        const menu = fs.readFileSync('baja/bio/splicing/exon-ai-models.js', 'utf8');
        ok(/exec\('baja\/bio\/splicing\/cryptic-exon-finder\.js'/.test(menu),
           'the exon menu calls the shared module');
        ok(!/generateCrypticExons/.test(menu),
           'and no longer has its own copy of what to do with the hits');
        ok(!/cryptic-exon-finder(-mm9)?\.py/.test(menu),
           'nor its own idea of which script is which species');

        const cat = fs.readFileSync('baja/ml/models-catalogue.js', 'utf8');
        ok(/title: 'Cryptic exons', badge: 'Phylon'/.test(cat),
           'the catalogue lists it beside the other splicing models');
        ok(/group: 'splicing'/.test(cat.slice(cat.indexOf("title: 'Cryptic exons'"), cat.indexOf("title: 'Cryptic exons'") + 200)),
           'in the splicing group');
        ok(/exec\('baja\/bio\/splicing\/cryptic-exon-finder\.js'/.test(cat),
           'and runs the same module');
        const entry = cat.slice(cat.indexOf("title: 'Cryptic exons'"), cat.indexOf("title: 'NMD consequence"));
        ok(/choice: \{/.test(entry) && /Score threshold/.test(entry),
           'the card asks for the threshold before the run rather than burying it');
        ok(/0\.98/.test(entry) && /0\.5/.test(entry), 'with a strict default and a way down from it');
        ok(/selectedRange/.test(entry) && /markstart != null && t\.markend != null/.test(entry),
           'from the selected stretch, since the catalogue hands over a track and not an exon');
        // Requiring a selection made the button do nothing at all for anyone who had not
        // made one, which is how this was reported: "the button doesn't work".
        ok(/t\.tgraph\.xmin/.test(entry),
           'and from what is on screen when nothing is selected, rather than refusing');
        ok(/not that the spliceosome uses it/.test(entry) && /conserved like an/.test(entry),
           'with what a hit means, and does not mean, in its documentation');
    }

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
