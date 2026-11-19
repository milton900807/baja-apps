// COMPARING IS NOT SELECTING.
//
//     node tools/test/compare-sequences.js
//
// "compare the sequences between exon 16 on both tracks" was read as two selections: select
// exon 16 here, select exon 16 there. Both steps were correct and the answer was useless,
// because selecting is not comparing. It leaves two highlighted stretches and no number.
//
// The comparison existed all along on the Selection > Tracks > Compare menu. The catalogue is
// the only thing a typed request can reach, and selecting was the only thing in it that
// mentioned a region on a track, so that is what the request was bent into.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let compared = [], proteins = [];
let backendAvailable = false;
const load = async (p, ...a) => {
    if (('' + p).indexOf('compare-track-sequences') >= 0) {
        compared.push({ tracks: a[1], opts: a[2] || {} });
        return true;
    }
    // Whole-protein comparison goes to the backend aligner now; everything else, and a
    // backend that cannot be reached, still goes to the browser module above.
    if (('' + p).indexOf('compare-proteins') >= 0) {
        proteins.push({ tracks: a[1] });
        return backendAvailable ? { pairs: [] } : { unavailable: true };
    }
    if (('' + p).indexOf('track-regions') >= 0) {
        const t = a[0];
        return {
            resolve: (args) => {
                if (args.region !== 'exon') return { error: 'only exons here' };
                if (args.index !== 16) return { error: 'this transcript has no exon ' + args.index };
                // Each track has its own coordinates: the same exon is not in the same place.
                return t.__exon16
                    ? Object.assign({ label: 'exon 16 of 32' }, t.__exon16)
                    : { error: 'no exon 16 on ' + t.name };
            }
        };
    }
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const mk = (name, ex) => ({
    name: name, markstart: null, markend: null, marks: [], orf: { cdsi: [1] },
    __exon16: ex || null, getSelectedRanges: () => []
});
const mkCap = async (ts) => {
    const graph = { track: ts, said: [], getTracks: () => ts,
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); } };
    return { C: await load('baja/manchester/menu/editor-capabilities.js', graph, {}), graph };
};
const go = async (C, args) => {
    compared = []; proteins = [];
    const p = C.preview({ capability: 'compare_sequences', args: args || {} });
    if (p.ok && !p.blocker) await p.capability.run(p.args);
    return p;
};

(async () => {
    const A = mk('MAPK8IP3', { start: 4000, end: 4170 });
    const B = mk('MAPK8IP3**', { start: 9000, end: 9170 });
    let { C, graph } = await mkCap([A, B]);

    ok(!!C.list.filter((c) => c.name === 'compare_sequences')[0],
       'compare_sequences is a declared operation');

    // ---- two tracks, no region ----------------------------------------------------------
    // Protein is the default and proteins are aligned on the backend; with the backend out
    // of reach the browser module answers, which is what this stub arranges.
    let p = await go(C, {});
    ok(proteins.length === 1 && proteins[0].tracks.length === 2,
       'a protein comparison is offered to the backend aligner first');
    ok(compared.length === 1 && compared[0].tracks.length === 2,
       'and with the backend unreachable the browser answers, on both tracks, without being '
       + 'told which');

    backendAvailable = true;
    await go(C, {});
    ok(proteins.length === 1 && compared.length === 0,
       'when the backend does answer, the browser aligner does not also run');
    backendAvailable = false;
    // Back to the fallback path, so there is a browser call to inspect.
    p = await go(C, {});
    ok(!compared[0].opts.ranges.length, 'and compares all of each: ' + JSON.stringify(compared[0].opts.ranges));
    ok(/report the identity between them/.test(p.text), 'the card says what it will do: ' + p.text);

    // ---- a named region ---------------------------------------------------------------------
    p = await go(C, { region: 'exon', index: 16 });
    ok(compared.length === 1, 'a named region still runs one comparison, not two selections');
    ok(compared[0].opts.ranges.length === 2,
       'one range per track: ' + JSON.stringify(compared[0].opts.ranges));
    ok(compared[0].opts.ranges[0].start === 4000 && compared[0].opts.ranges[1].start === 9000,
       'each resolved on its OWN track, because exon 16 of one transcript is not where exon '
       + '16 of the other is: ' + JSON.stringify(compared[0].opts.ranges.map((r) => r.start)));
    ok(/compare exon 16 of MAPK8IP3 and MAPK8IP3\*\*/.test(p.text), 'said plainly: ' + p.text);

    // ---- a region one track does not have is refused, not half-compared -----------------------
    const C2 = (await mkCap([A, mk('OTHER', null)])).C;
    const g2 = (await mkCap([A, mk('OTHER', null)])).graph;
    const cap2 = (await mkCap([A, mk('OTHER', null)]));
    p = await go(cap2.C, { region: 'exon', index: 16 });
    ok(!compared.length, 'nothing is compared when one track has no such region');
    ok(/Cannot compare that region/.test(cap2.graph.said.join(' ')),
       'and it says which track and why: ' + cap2.graph.said.join(' '));

    // ---- one track is not a comparison ---------------------------------------------------------
    const cap1 = await mkCap([A]);
    p = cap1.C.preview({ capability: 'compare_sequences', args: {} });
    ok(/two tracks are needed/.test(p.blocker || ''),
       'one open track is refused before the button: ' + p.blocker);

    // ---- named tracks win over what happens to be open ---------------------------------------
    const D = mk('THIRD', null);
    const cap3 = await mkCap([A, B, D]);
    p = await go(cap3.C, { tracks: 'MAPK8IP3, THIRD' });
    ok(compared[0].tracks.length === 2 && compared[0].tracks[1] === D,
       'the two named are the two compared: '
       + compared[0].tracks.map((t) => t.name).join(' + '));

    // ---- the mode goes through -------------------------------------------------------------------
    p = await go(C, { mode: 'coding' });
    ok(compared[0].opts.mode === 'coding', 'the mode is passed: ' + compared[0].opts.mode);

    // ---- the comparison honours a range ------------------------------------------------------------
    const cmp = fs.readFileSync('baja/manchester/menu/compare-track-sequences.js', 'utf8');
    ok(/A STRETCH OF EACH TRACK RATHER THAN ALL OF IT/.test(cmp),
       'compare-track-sequences takes one range per track');
    ok(/The region wins outright/.test(cmp)
       && /if \(rg\) \{[\s\S]{0,700}return it;[\s\S]{0,80}if \(mode === 'coding'\)/.test(cmp),
       'and the region branch returns before any whole-track path can substitute itself for '
       + 'a request about one exon');
    ok(/\? \['nt'\]/.test(cmp),
       'a region is compared as nucleotides whatever mode was asked for: a stretch of DNA '
       + 'has no peptide of its own, and translating one would be inventing a frame');

    const plan = fs.readFileSync('py/bio/editor/plan.py', 'utf8');
    ok(/COMPARING IS NOT SELECTING/.test(plan),
       'and the planner is told, since selecting the region on each track is not a weaker '
       + 'version of comparing them, it is a different request');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
