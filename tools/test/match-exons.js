// EVERY EXON OF ONE TRACK, MATCHED TO ITS CLOSEST BLOCK ON ANOTHER.
//
//     node tools/test/match-exons.js
//
// "iterate over all exons in spag9_mrna and find the closest sequence block that matches it
// on mapk8ip3_mrna" was refused: "the editor cannot loop through exons automatically; you
// would need to search each exon individually". Searching thirty times by hand is the work
// the editor should be doing, and the loop is the easy part.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let searches = [], helpShown = null, pyReply = null;
const load = async (p, ...a) => {
    if (('' + p).indexOf('search-region-in-track.py') >= 0) {
        searches.push({ q: a[0], t: a[1], o: a[2] });
        return (typeof pyReply === 'function') ? pyReply(a[0], a[1], a[2]) : pyReply;
    }
    if (('' + p).indexOf('decor-help') >= 0) { helpShown = a[0] && a[0].decor && a[0].decor.help; return true; }
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
    const A = mk('SPAG9_mRNA', [[100, 300], [500, 700], [900, 1100], [1300, 1308]]);
    const B = mk('MAPK8IP3_mRNA', [[0, 2000]]);
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
    let r = await load('baja/bio/match-exons.js', graph, A, B, {});

    ok(searches.length === 3, 'one search per exon that can be searched: ' + searches.length);
    ok(searches.every((s) => s.t.name === 'MAPK8IP3_mRNA' && s.t.seq.length > 1000),
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
    ok(/SPAG9_mRNA/.test(vtext) && /MAPK8IP3_mRNA/.test(vtext), 'both lanes are named');
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
    const A2 = mk('SPAG9_mRNA', [[100, 300], [500, 700]]);
    const B2 = mk('MAPK8IP3_mRNA', [[0, 2000]]);
    r = await load('baja/bio/match-exons.js', graph, A2, B2, {});
    ok(!!r.error && /None of the 2 exons/.test(r.error),
       'nothing matching is said plainly rather than drawn as an empty layer: ' + r.error);
    ok(!(A2.track_layers || []).length, 'and nothing is drawn');

    // ---- a track with no exons ----------------------------------------------------------
    const bare = mk('plain', []);
    r = await load('baja/bio/match-exons.js', graph, bare, B, {});
    ok(/no annotated exons/.test(r.error || ''), 'a track with no exons is said: ' + r.error);
    r = await load('baja/bio/match-exons.js', graph, A, A, {});
    ok(/same track/.test(r.error || ''), 'and one track against itself: ' + r.error);

    // ---- the capability ------------------------------------------------------------------
    const C = await load('baja/manchester/menu/editor-capabilities.js', graph, {});
    const names = C.catalogue().map((c) => c.name);
    ok(names.indexOf('match_exons_across_tracks') >= 0,
       'the planner can reach it: it is in the catalogue');
    const p = C.preview({ capability: 'match_exons_across_tracks',
        args: { query_track: 'SPAG9_mRNA', target_track: 'MAPK8IP3_mRNA' } });
    ok(!p.blocker, 'it runs with both tracks named: ' + (p.blocker || '(none)'));
    ok(/4 exons/.test(p.text) && /4 searches/.test(p.text),
       'and the card says how many searches that is before the button: ' + p.text);
    const p2 = C.preview({ capability: 'match_exons_across_tracks', args: { query_track: 'SPAG9_mRNA' } });
    ok(/say which track to search/.test(p2.blocker || ''),
       'one track named is not enough, and it says so: ' + (p2.blocker || ''));

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
