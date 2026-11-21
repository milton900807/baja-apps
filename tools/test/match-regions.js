// EVERY EXON OF ONE TRACK, MATCHED TO ITS CLOSEST BLOCK ON ANOTHER.
//
//     node tools/test/match-regions.js
//
// "iterate over all exons in <one track> and find the closest sequence block that matches
// it on <another>" was refused: "the editor cannot loop through exons automatically; you
// would need to search each exon individually". Searching thirty times by hand is the work
// the editor should be doing, and the loop is the easy part.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let searches = [], helpShown = null, pyReply = null, viewModel = null, captureModel = false;
let psiRuns = [], psiGives = null, psiThrows = false;
const load = async (p, ...a) => {
    if (('' + p).indexOf('search-region-in-track.py') >= 0) {
        searches.push({ q: a[0], t: a[1], o: a[2] });
        return (typeof pyReply === 'function') ? pyReply(a[0], a[1], a[2]) : pyReply;
    }
    if (('' + p).indexOf('decor-help') >= 0) { helpShown = a[0] && a[0].decor && a[0].decor.help; return true; }
    if (('' + p).indexOf('compare-view.js') >= 0 && captureModel) { viewModel = a[0]; return null; }
    if (('' + p).indexOf('splicing-profile.js') >= 0) {
        psiRuns.push({ track: a[2] && a[2].name, mode: a[4] });
        if (psiThrows) throw new Error('the model did not answer');
        if (psiGives) { (a[2].track_layers = a[2].track_layers || []).push(psiGives(a[2])); }
        return true;
    }
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const src = fs.readFileSync(path, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// A track with four exons, and a sequence long enough to take them from.
const seq = (n) => { let s = ''; const b = 'ACGT'; for (let i = 0; i < n; i++) s += b[(i * 7) % 4]; return s; };
const mk = (name, exons) => {
    const S = seq(4000);
    return {
        name: name, xi: 0, xf: 4000, sequence: S,
        track_layers: [], addLayer(l) { this.track_layers.push(l); },
        annotations: exons.map((e) => ({ type: 'Exon', xi: e[0], xf: e[1] })),
        getSequenceRange: (a, b) => S.substring(Math.max(0, a), Math.max(0, b)),
        getSelectedRanges: () => [],
        grid: { yi: 1, xi: 0, width: 10, height: -1 }
    };
};

(async () => {
    const A = mk('QUERY_mRNA', [[100, 300], [500, 700], [900, 1100], [1300, 1308]]);
    const B = mk('TARGET_mRNA', [[0, 2000]]);
    const graph = { track: [A, B], said: [], wake() { }, getTracks: () => [A, B],
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); } };

    // Every exon matches somewhere, the third one reversed.
    // THE SHAPE THE REAL SEARCHER RETURNS, field for field. A stub that invents its own
    // names passes whatever the caller reads, which is how NaN-NaN positions and 0.0%
    // coverage reached the screen with a green test suite behind them. The contract is
    // asserted against the real script further down.
    pyReply = (q) => {
        const n = +(('' + q.name).replace(/\D+/g, '') || 0);
        const qs = +q.offset;
        return { status: 'OK', hits: [{
            rank: 1,
            start: 1000 + n * 100, end: 1000 + n * 100 + 180,
            query_start: qs, query_end: qs + 180,
            identity: 0.9 - n * 0.05, score: 300 - n * 10,
            strand: (n === 3 ? '-' : '+'),
            identical: 160, length: 181, gaps: 0, query_coverage: 0.9
        }] };
    };
    searches = []; helpShown = null;
    let r = await load('baja/bio/match-regions.js', graph, A, B, {});

    ok(searches.length === 3, 'one search per exon that can be searched: ' + searches.length);
    ok(searches.every((s) => s.t.name === 'TARGET_mRNA' && s.t.seq.length > 1000),
       'each against the WHOLE of the other track');
    ok(searches.every((s) => s.o.max_hits === 1),
       'keeping the closest block only, which is what was asked for');
    ok(searches.every((s) => s.o.strands === 'both'),
       'on both strands: two transcripts can carry the same element reversed');
    ok(searches[0].q.offset === 100 && searches[0].q.seq.length === 200,
       'the exon goes out with its own left edge, so hits come back in track coordinates: '
       + JSON.stringify({ off: searches[0].q.offset, len: searches[0].q.seq.length }));

    const found0 = () => r.found[0];
    ok(r.count === 3 && r.of === 4, 'three of the four are reported: ' + JSON.stringify({ c: r.count, of: r.of }));
    ok(r.missed.length === 1 && r.missed[0].exon === 4 && /too short/.test(r.missed[0].why),
       'and the 8 nt exon is SAID to be too short, not dropped silently: '
       + JSON.stringify(r.missed));

    // ---- drawn on both tracks, linked, numbered by exon ---------------------------------
    const layOf = (t) => (t.track_layers || []).find((l) => l && l.data_type === 'SEQSIM');
    const la = layOf(A), lb = layOf(B);
    ok(!!la && !!lb, 'both tracks carry a layer of the matches');
    ok((la.intervals || []).length === 3 && (lb.intervals || []).length === 3,
       'one bar per matched exon on each: '
       + ((la.intervals || []).length + '/' + (lb.intervals || []).length));
    const labels = (la.intervals || []).map((v) => '' + (v.t || ''));
    ok(/^e1 /.test(labels[0]), 'numbered by EXON, not by rank: ' + labels.join(' | '));
    ok(/⇄/.test(labels[2]), 'and a reversed match is marked as one: ' + labels[2]);
    ok((la.intervals || [])[0].x1 === 100 && (la.intervals || [])[0].x2 === 280,
       'the bar on the query track is the part of the exon that MATCHED, not the whole of '
       + 'it: a 40 nt hit inside a 170 nt exon would otherwise claim the exon matched: '
       + (la.intervals || [])[0].x1 + '-' + (la.intervals || [])[0].x2);
    ok((lb.intervals || [])[0].x1 === 1100,
       'and the bar on the other track is where it was found: ' + (lb.intervals || [])[0].x1);
    ok(found0().tx1 === 1100 && found0().tx2 === 1280 && isFinite(found0().tx1),
       'the target position is a number, not NaN: '
       + found0().tx1 + '-' + found0().tx2);
    ok(found0().covers === 0.9, 'and the coverage is the one the searcher reported: ' + found0().covers);
    ok(found0().strand === 1 && r.found[2].strand === -1,
       'strand comes back as the + / - the searcher sends, not as a number');

    ok((la.links || []).length === 3, 'each exon is joined to its block: ' + (la.links || []).length);
    ok(!lb.links || !lb.links.length, 'from one side only, or every arrow is drawn twice');
    ok(la.links[0].track === B && la.links[0].ox1 === 1100,
       'with the far end in the OTHER track’s coordinates');

    // ---- the answer is a PICTURE, with the numbers under it ------------------------------
    // Thirty rows of "148 nt at 4,827-4,975 matches ... 1,100-1,280" is the right
    // information in the wrong shape: where each exon went, whether the order held and
    // which flipped are shapes, and a list shows none of them.
    const view = document.getElementById('baja-compare-view');
    ok(!!view, 'a comparison view is opened, not a table');
    ok(view && /inset:\s*0/.test(view.style.cssText),
       'and it fills the window rather than floating over the thing it explains');
    ok(!helpShown, 'and the old text panel is NOT also opened over it');
    const svg = view ? view.querySelector('svg') : null;
    ok(!!svg, 'it draws something');
    const ribbons = view ? view.querySelectorAll('g.rb') : [];
    ok(ribbons.length === 3, 'one ribbon per matched exon: ' + ribbons.length);
    const notches = view ? view.querySelectorAll('rect[stroke-dasharray="3 2"]') : [];
    ok(notches.length === 1,
       'and the exon that matched nothing is a hollow notch in its place, not a line of '
       + 'prose: ' + notches.length);
    const vtext = view ? view.textContent : '';
    ok(/QUERY_mRNA/.test(vtext) && /TARGET_mRNA/.test(vtext), 'both lanes are named');
    ok(/e1/.test(vtext) && /85\.0%/.test(vtext),
       'each ribbon carries its exon number and its identity: ' + vtext.slice(0, 80));
    const inverted = view ? view.querySelectorAll('path[stroke-dasharray]') : [];
    ok(inverted.length === 1, 'the reversed pair is the dashed, crossed one: ' + inverted.length);

    // The numbers are not thrown away, just folded.
    const panel = view ? view.querySelector('[data-id="numbers-panel"]') : null;
    ok(!!panel && panel.style.display === 'none', 'the rows are there, folded away');
    ok(/exon 1/.test(panel.textContent) && /covering 90\.0% of the exon/.test(panel.textContent),
       'and hold the same figures as before: ' + panel.textContent.slice(0, 90));
    ok(!/NaN/.test(panel.textContent), 'with no NaN anywhere in them');
    try { view.querySelector('button[data-id="numbers"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); } catch (e) { }
    ok(panel.style.display === 'block', 'and Numbers opens them');
    // It leaves as a file: a figure like this ends up in a document or a talk.
    ok(!!view.querySelector('button[data-id="pdf"]') && !!view.querySelector('button[data-id="svg"]'),
       'it offers a PDF and an SVG');
    let saved = null;
    const realCreate = document.createElement.bind(document);
    document.createElement = (t) => {
        const n = realCreate(t);
        if (('' + t).toLowerCase() === 'a') { n.click = () => { saved = n.download; }; }
        return n;
    };
    try { window.URL.createObjectURL = () => 'blob:x'; window.URL.revokeObjectURL = () => { }; } catch (e) { }
    view.querySelector('button[data-id="svg"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    ok(/^Exons-of-QUERY-mRNA-matched-on-TARGET-mRNA\.svg$/.test(saved || ''),
       'the SVG downloads under the comparison\u2019s own name: ' + saved);
    document.createElement = realCreate;

    // Without jsPDF the PDF button says so and points at the SVG, rather than doing nothing.
    view.querySelector('button[data-id="pdf"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    const said = view.querySelector('[data-id="said"]');
    ok(/jsPDF/.test((said && said.textContent) || '') && /SVG/.test((said && said.textContent) || ''),
       'a missing jsPDF is said, with the way out: ' + ((said && said.textContent) || ''));

    try { view.querySelector('button[data-id="close"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); } catch (e) { }
    ok(!document.getElementById('baja-compare-view'), 'Close puts it away');

    // ---- the contract, against the REAL searcher -----------------------------------------
    // The stub above can only be trusted as far as this: the field names it uses are the
    // ones the script actually resolves.
    const py = fs.readFileSync('py/bio/search-region-in-track.py', 'utf8');
    for (const field of ['"start"', '"end"', '"query_start"', '"query_end"',
                         '"query_coverage"', '"identity"', '"score"', '"strand"']) {
        ok(py.indexOf(field + ':') >= 0, 'the searcher returns ' + field);
    }
    ok(/"strand": "\+" if/.test(py),
       'and strand is the character + or -, which is why comparing it with < 0 was always false');

    // ---- nothing matches anywhere -------------------------------------------------------
    pyReply = { status: 'OK', hits: [] };
    const A2 = mk('QUERY_mRNA', [[100, 300], [500, 700]]);
    const B2 = mk('TARGET_mRNA', [[0, 2000]]);
    r = await load('baja/bio/match-regions.js', graph, A2, B2, {});
    ok(!!r.error && /None of the 2 exons/.test(r.error),
       'nothing matching is said plainly rather than drawn as an empty layer: ' + r.error);
    ok(!(A2.track_layers || []).length, 'and nothing is drawn');

    captureModel = true;
    // ---- how stably each exon splices, carried into the picture -------------------------
    // The ribbons say which exons correspond and how alike they are. Whether an exon is
    // reliably in the message is a different question, and the one that decides whether a
    // conserved block is worth anything.
    // The first exon matches; the second finds nothing, so both halves of the picture --
    // a ribbon and a notch -- are exercised.
    let callN = 0;
    pyReply = () => {
        callN++;
        return (callN === 1)
            ? { status: 'OK', hits: [{ start: 900, end: 1100, query_start: 100, query_end: 300,
                query_coverage: 1, identity: 0.9, score: 200, strand: '+' }] }
            : { status: 'OK', hits: [] };
    };
    const A5 = mk('QUERY', [[100, 300], [500, 700]]);
    const B5 = mk('TARGET', [[0, 2000]]);
    // The PSI layer's own rows, which is where the number on the canvas comes from.
    A5.track_layers.push({ magnitudeMode: 'psi', exonStability: [
        { exon: 1, lo: 100, hi: 300, psi: 0.995, word: 'constitutive' },
        { exon: 2, lo: 500, hi: 700, psi: 0.42, word: 'unstable' }] });
    B5.track_layers.push({ magnitudeMode: 'psi', exonStability: [
        { exon: 4, lo: 850, hi: 1150, psi: 0.1, word: 'rarely in', measured: { gene: 'MEASURED_SET' } }] });
    viewModel = null; callN = 0;
    r = await load('baja/bio/match-regions.js', graph, A5, B5, {});
    ok(!!viewModel, 'the picture is drawn');
    ok(viewModel && viewModel.stability && viewModel.stability.a && viewModel.stability.b,
       'and knows both tracks have been scored: ' + JSON.stringify(viewModel && viewModel.stability));
    const blk = (viewModel.blocks || [])[0];
    ok(blk && blk.a.stab && blk.a.stab.pct === 100,
       'the exon carries its own stability: ' + JSON.stringify(blk && blk.a.stab));
    // The hit on the OTHER track is a stretch of sequence with no exon number of its own,
    // so its stability is the exon it overlaps there, matched by position.
    ok(blk && blk.b.stab && blk.b.stab.pct === 10 && blk.b.stab.measured === true,
       'and the block it landed on carries the target exon\'s: ' + JSON.stringify(blk && blk.b.stab));
    const un = (viewModel.unmatched || [])[0];
    ok(un && un.a.stab && un.a.stab.pct === 42,
       'an exon that matched nothing still says how stable it is: ' + JSON.stringify(un && un.a.stab));

    // Untrusted PSI is not a number: it must never be printed as one.
    A5.track_layers[0].exonStability[0] = { exon: 1, lo: 100, hi: 300, psi: 0.96,
        untrusted: true, untrustedWhy: 'measured in another transcript' };
    viewModel = null; callN = 0;
    r = await load('baja/bio/match-regions.js', graph, A5, B5, {});
    const blk2 = (viewModel.blocks || [])[0];
    ok(blk2 && blk2.a.stab && blk2.a.stab.untrusted === true && blk2.a.stab.pct == null,
       'an untrusted exon carries no percentage at all: ' + JSON.stringify(blk2 && blk2.a.stab));

    // NOT SCORED YET: run it rather than asking the user to. The note telling someone to
    // go and run PSI was the editor asking for something it can do itself, on tracks it is
    // already holding.
    const A6 = mk('QUERY', [[100, 300]]);
    const B6 = mk('TARGET', [[0, 2000]]);
    viewModel = null; callN = 0; psiRuns = [];
    psiGives = (t) => ({ magnitudeMode: 'psi', exonStability: [
        { exon: 1, lo: 100, hi: 300, psi: 0.88, word: 'stable' },
        { exon: 1, lo: 850, hi: 1150, psi: 0.7, word: 'stable' }] });
    r = await load('baja/bio/match-regions.js', graph, A6, B6, { layout: {} });
    ok(psiRuns.length === 2 && psiRuns.every((x) => x.mode === 'psi'),
       'PSI is run on both tracks, in psi mode: ' + JSON.stringify(psiRuns));
    ok(viewModel && viewModel.stability && viewModel.stability.a && viewModel.stability.b,
       'so the picture has the row after all: ' + JSON.stringify(viewModel && viewModel.stability));
    ok(viewModel && (viewModel.blocks || [{}])[0].a.stab
       && (viewModel.blocks || [{}])[0].a.stab.pct === 88,
       'carrying the number that run produced: ' + JSON.stringify((viewModel.blocks || [{}])[0].a.stab));

    // A track that already has PSI is not re-run: it is a model call per track.
    psiRuns = []; viewModel = null; callN = 0;
    r = await load('baja/bio/match-regions.js', graph, A6, B6, { layout: {} });
    ok(psiRuns.length === 0, 'and it is not run again on a track that has it: ' + JSON.stringify(psiRuns));

    // A PSI RUN THAT FAILS DOES NOT LOSE THE COMPARISON. The picture is the answer; the
    // stability row is an addition to it.
    const A7 = mk('QUERY', [[100, 300]]);
    const B7 = mk('TARGET', [[0, 2000]]);
    psiRuns = []; viewModel = null; callN = 0; psiGives = null;
    const realLoad = pyReply;
    psiThrows = true;
    r = await load('baja/bio/match-regions.js', graph, A7, B7, { layout: {} });
    psiThrows = false;
    ok(!!viewModel, 'the picture is still drawn when PSI fails');
    ok(viewModel && viewModel.stability && viewModel.stability.tried === true
       && !viewModel.stability.a,
       'and the view is told it was TRIED, not that nobody has run it: '
       + JSON.stringify(viewModel && viewModel.stability));
    ok(viewModel && !(viewModel.blocks || [{}])[0].a.stab, 'with no number invented for it');
    captureModel = false;

    // ---- and the view draws them outside the lanes --------------------------------------
    // Inside the lane the exon number already sits in dark type on a coloured bar, and a
    // second number there is read as part of the first.
    const view2 = await load('baja/bio/compare-view.js', {
        title: 'Exons of QUERY matched on TARGET', summary: 's',
        a: { name: 'QUERY', x1: 0, x2: 10000 }, b: { name: 'TARGET', x1: 0, x2: 10000 },
        blocks: [{ n: 1, label: 'e1', identity: 0.9, a: { x1: 1000, x2: 1200, stab: { pct: 97, word: 'stable' } },
                   b: { x1: 5000, x2: 5200, stab: { pct: 10, measured: true, word: 'rarely in' } } }],
        unmatched: [], rows: [['a', 'b']], stability: { a: true, b: true }
    });
    const svgEl = document.getElementById('baja-compare-view').querySelector('svg');
    const texts = Array.from(svgEl.querySelectorAll('text')).map((t) => ({
        s: t.textContent, y: +t.getAttribute('y'), fill: t.getAttribute('fill') }));
    const laneTop = 92, LANEH = 30;                 // TOP and LANE in compare-view.js
    const t97 = texts.find((t) => t.s === '97%');
    ok(!!t97, 'the stability shows on the top lane: ' + JSON.stringify(texts.map((t) => t.s)));
    ok(t97 && t97.y < laneTop, 'above the lane, not inside it: y=' + (t97 && t97.y) + ' lane at ' + laneTop);
    ok(t97 && t97.fill === '#86efac', 'green while the exon is kept: ' + (t97 && t97.fill));
    const tm = texts.find((t) => t.s === '~10%');
    ok(!!tm && tm.fill === '#c4b5fd',
       'a measured inclusion is marked and violet, never read as model output: ' + JSON.stringify(tm));
    ok(tm && tm.y > laneTop + LANEH, 'and sits below the bottom lane: y=' + (tm && tm.y));
    // The exon number stays where it was, inside its bar.
    ok(texts.some((t) => t.s === 'e1' && t.y > laneTop && t.y < laneTop + LANEH),
       'the exon label is still in the lane');
    // A BAR IS AS WIDE AS ITS BLOCK, and most blocks are a few pixels: a label in dark type
    // then sits on the dark lane rather than on its own colour, which is near-black on navy.
    const lab = texts.find((t) => t.s === 'e1');
    ok(lab && lab.fill === '#eaf6f9', 'and is light, not dark on dark: ' + (lab && lab.fill));
    const labEl = Array.from(svgEl.querySelectorAll('text')).find((t) => t.textContent === 'e1');
    ok(labEl && /rgba\(4,16,30/.test(labEl.getAttribute('stroke') || '')
       && labEl.getAttribute('paint-order') === 'stroke',
       'with an outline so it reads on a bright bar too: ' + (labEl && labEl.getAttribute('stroke')));
    try { document.getElementById('baja-compare-view').querySelector('button[data-id="close"]')
        .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); } catch (e) { }

    // With nothing scored, the view says why the row is empty instead of leaving a gap.
    await load('baja/bio/compare-view.js', {
        title: 'T', summary: 's', a: { name: 'A', x1: 0, x2: 100 }, b: { name: 'B', x1: 0, x2: 100 },
        blocks: [{ n: 1, label: 'e1', identity: 0.5, a: { x1: 10, x2: 20 }, b: { x1: 30, x2: 40 } }],
        unmatched: [], rows: [['a', 'b']], stability: { a: false, b: false }
    });
    // It says what the state is rather than that the figures are "not shown": leading with
    // the absence tells the reader what they can already see.
    ok(/No PSI run on A or B yet/.test(document.getElementById('baja-compare-view').textContent)
        && !/not shown/.test(document.getElementById('baja-compare-view').textContent),
       'an unscored pair says nobody has run it: '
       + document.getElementById('baja-compare-view').textContent.slice(0, 140));
    try { document.getElementById('baja-compare-view').querySelector('button[data-id="close"]')
        .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); } catch (e) { }

    // ---- a failure is not a negative result ---------------------------------------------
    // The target's genomic track was 571 kb, the searcher refused anything over 400 kb, and
    // all 22 searches returned that error. It was reported as "none of the 22 exons of the
    // query matches anything on the target above the noise floor" -- false about a pair of
    // paralogues, and
    // said without anything having been compared.
    pyReply = { status: 'ERROR', error: 'that track is 571,219 bases, too long to scan here' };
    const A3 = mk('QUERY', [[100, 300], [500, 700]]);
    const B3 = mk('TARGET', [[0, 2000]]);
    r = await load('baja/bio/match-regions.js', graph, A3, B3, {});
    ok(!!r.error && /could not run/.test(r.error),
       'the reason the searches failed is what comes back: ' + r.error);
    ok(!!r.error && /too long to scan/.test(r.error),
       'carrying what the searcher actually said: ' + r.error);
    ok(!!r.error && !/noise floor/.test(r.error),
       'and it does not claim the sequences were compared and found wanting: ' + r.error);

    // A single failure among real matches is still a match report, not an error.
    let nth = 0;
    pyReply = () => {
        nth++;
        return (nth === 1) ? { status: 'ERROR', error: 'the search failed' }
            : { status: 'OK', hits: [{ start: 900, end: 1100, query_start: 100, query_end: 300,
                query_coverage: 1, identity: 0.9, score: 200, strand: '+' }] };
    };
    const A4 = mk('QUERY', [[100, 300], [500, 700]]);
    const B4 = mk('TARGET', [[0, 2000]]);
    nth = 0;
    r = await load('baja/bio/match-regions.js', graph, A4, B4, {});
    ok(!r.error, 'one failed search among matches does not become the whole answer: ' + (r.error || 'no error'));

    // ---- a track with no exons ----------------------------------------------------------
    const bare = mk('plain', []);
    r = await load('baja/bio/match-regions.js', graph, bare, B, {});
    ok(/no exons to iterate over/.test(r.error || ''), 'a track with no exons is said: ' + r.error);
    r = await load('baja/bio/match-regions.js', graph, A, A, {});
    ok(/same track/.test(r.error || ''), 'and one track against itself: ' + r.error);

    // ---- exons are one kind of region, not the only one ----------------------------------
    // "compare the introns", "does the 3' UTR match anything over there" is the same
    // question, and writing it for exons alone would have meant copying this twice.
    const withUtr = () => {
        const t = mk('QUERY_mRNA', [[100, 300], [500, 700], [900, 1100]]);
        // a coding span inside the exons, which is what gives a transcript its UTRs
        t.annotations.push({ type: 'Translation', xi: 250, xf: 950 });
        return t;
    };
    pyReply = (q) => ({ status: 'OK', hits: [{
        rank: 1, start: 1500, end: 1700, query_start: +q.offset, query_end: +q.offset + 200,
        identity: 0.81, score: 220, strand: '+', identical: 162, length: 200, gaps: 0,
        query_coverage: 0.88
    }] });

    searches = [];
    const U = withUtr();
    let ru = await load('baja/bio/match-regions.js', graph, U, B, { features: 'introns' });
    ok(ru.count === 2 && ru.word === 'intron',
       'introns are iterated like exons: ' + JSON.stringify({ c: ru.count, w: ru.word }));
    ok(searches.every((s2) => /^intron \d+$/.test('' + s2.q.name)),
       'and go out named as introns: ' + searches.map((s2) => s2.q.name).join(', '));
    let vv = document.getElementById('baja-compare-view');
    ok(/Introns of QUERY_mRNA/.test(vv ? vv.textContent : ''),
       'the picture says what it is a picture of: ' + (vv ? vv.textContent.slice(0, 40) : ''));
    try { vv.querySelector('button[data-id="close"]').click(); } catch (e) { }

    // A single region is the same operation with the loop running once, not a special case.
    searches = [];
    ru = await load('baja/bio/match-regions.js', graph, U, B, { features: 'three_prime_utr' });
    ok(ru.count === 1 && /UTR/.test(ru.word), 'the 3\u2032 UTR is one region, one search: '
       + JSON.stringify({ c: ru.count, s: searches.length, w: ru.word }));
    ok(searches.length === 1, 'exactly one search was made');
    vv = document.getElementById('baja-compare-view');
    const lbl = vv ? vv.textContent : '';
    ok(/UTR/.test(lbl) && !/UTR 1/.test(lbl),
       'and its bar is named for what it is, not numbered as though there were a second');
    try { vv.querySelector('button[data-id="close"]').click(); } catch (e) { }

    // A region the track does not have is the answer, not an empty picture.
    const noncoding = mk('lncRNA', [[100, 300], [500, 700]]);
    ru = await load('baja/bio/match-regions.js', graph, noncoding, B, { features: 'cds' });
    ok(/no |has no/.test(ru.error || ''), 'a track with no CDS is told about: ' + ru.error);
    const single = mk('one_exon', [[100, 900]]);
    ru = await load('baja/bio/match-regions.js', graph, single, B, { features: 'introns' });
    ok(/single-exon/.test(ru.error || ''),
       'and a single-exon transcript has no introns, which is said in those words: ' + ru.error);

    // ---- the capability ------------------------------------------------------------------
    const C = await load('baja/manchester/menu/editor-capabilities.js', graph, {});
    const names = C.catalogue().map((c) => c.name);
    ok(names.indexOf('match_regions_across_tracks') >= 0,
       'the planner can reach it: it is in the catalogue');
    const p = C.preview({ capability: 'match_regions_across_tracks',
        args: { query_track: 'QUERY_mRNA', target_track: 'TARGET_mRNA' } });
    ok(!p.blocker, 'it runs with both tracks named: ' + (p.blocker || '(none)'));
    ok(/4 exons/.test(p.text) && /4 searches/.test(p.text),
       'and the card says how many searches that is before the button: ' + p.text);
    const p2 = C.preview({ capability: 'match_regions_across_tracks', args: { query_track: 'QUERY_mRNA' } });
    ok(/say which track to search/.test(p2.blocker || ''),
       'one track named is not enough, and it says so: ' + (p2.blocker || ''));

    // The card counts the right things for the kind asked for, and refuses what the track
    // does not have before the button rather than after it.
    const pIn = C.preview({ capability: 'match_regions_across_tracks',
        args: { query_track: 'QUERY_mRNA', target_track: 'TARGET_mRNA', features: 'introns' } });
    ok(/3 introns/.test(pIn.text) && /3 searches/.test(pIn.text),
       'introns are counted as introns: ' + pIn.text);
    const pU = C.preview({ capability: 'match_regions_across_tracks',
        args: { query_track: 'QUERY_mRNA', target_track: 'TARGET_mRNA', features: 'three_prime_utr' } });
    ok(/no 3\u2032 UTR/.test(pU.blocker || ''),
       'a track with no 3\u2032 UTR is refused before the button: ' + (pU.blocker || ''));

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
