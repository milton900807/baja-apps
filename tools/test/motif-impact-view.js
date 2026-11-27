// THE MOTIF IMPACT RESULT SET: the window, its files, and the choosing that precedes it.
//
//     node tools/test/motif-impact-view.js          (needs jsdom)
//
// Three claims live in one window here -- motifs a variant GAINED, motifs it DESTROYED,
// and motifs the protein already carried -- and they must never blur into one list: a
// reader who cannot tell a gain from a loss has been shown the opposite of the result.
// The download is driven too, because a file that quietly drops the upper-bound flag is
// the caveat gone, and nobody opening that CSV next week would know.
const fs = require('fs');
const { JSDOM } = require('jsdom');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const dom = new JSDOM('<!doctype html><html><body><canvas id="cv" width="1200" height="800"></canvas></body></html>',
    { url: 'https://gene.clinic/', pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const cv = document.getElementById('cv');
cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800 });
global.Blob = dom.window.Blob;
global.URL = dom.window.URL;
if (!global.URL.createObjectURL) global.URL.createObjectURL = () => 'blob:x';
if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = () => { };
global.focusUnlessMobile = () => { };

const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

const said = [];
const graph = {
    setMessage: (m) => said.push(m), setResultMessage: (m) => said.push(m),
    track: [], wake: () => { }
};

// A scan payload in the shape py/bio/protein/slim-scan.py sends: JSON strings under
// motifs / gained / lost / meta, every number already computed.
const RESULT = {
    error: '',
    motifs: JSON.stringify([
        { elm: 'MOD_CK1_1', site: 'CK1 phosphorylation site', start: 310, end: 316,
          peptide: 'SGAGSGA', score: 0.41, rank: 2, blurb: 'CK1 target site.' },
        { elm: 'LIG_SH3_3', site: 'SH3 ligand', start: 20, end: 26, peptide: 'PPLPPRP',
          score: 0.62, rank: 1, blurb: 'Class II SH3 ligand.' },
        { elm: 'DOC_USP7_MATH_1', site: 'USP7 docking', start: 90, end: 94, peptide: 'PSTSS',
          score: 0.02, below_cutoff: true, blurb: '' }
    ]),
    gained: JSON.stringify([
        { elm: 'MOD_GSK3_1', site: 'GSK3 phosphorylation site', start: 313, end: 320,
          peptide: 'TPPASSGT', score: 0.55, variant: 'A315T',
          score_is_upper_bound: true, blurb: 'GSK3 target site.' },
        { elm: 'MOD_SUMO_rev_2', site: 'SUMO site', start: 335, end: 341, peptide: 'VKEEMQV',
          score: 0.33, variant: 'M337V', score_is_upper_bound: true, blurb: '' }
    ]),
    lost: JSON.stringify([
        { elm: 'DOC_USP7_MATH_1', site: 'USP7 docking', start: 90, end: 94, peptide: 'PSTSS',
          score: 0.02, variant: 'A315T', blurb: '' }
    ]),
    meta: JSON.stringify({
        scoring: 'model', classes: 300, length: 414, min_score: 0.5,
        cutoff_rule: 'top 30', conservation: true, accession: 'Q13148',
        variants: ['A315T', 'M337V'],
        caveats: ['A motif is a regex match from the ELM catalogue.',
                  'A gained motif’s score is an UPPER BOUND.']
    })
};

const mkTrack = () => ({
    name: 'TARDBP', xi: 1, xf: 1245, sequence: 'A'.repeat(1245),
    annotations: [
        { protein: 'p.Ala315Thr', significance: 'Pathogenic' },
        { protein: 'p.M337V', significance: 'Pathogenic' },
        { protein: 'p.N352S', significance: 'Conflicting interpretations' },
        { protein: 'c.943G>A' }
    ],
    track_layers: [], addLayer(l) { this.track_layers.push(l); }
});

(async () => {
    const saved = [];
    // The download is a click on an <a download>, so that is what is watched: the file's
    // name and its bytes, not a function that was called.
    const realCreate = document.createElement.bind(document);
    document.createElement = (tag) => {
        const el = realCreate(tag);
        if (('' + tag).toLowerCase() === 'a') {
            el.click = () => saved.push({ name: el.download, href: el.href });
        }
        return el;
    };
    const realBlob = global.Blob;
    const blobs = [];
    global.Blob = function (parts, opts) { blobs.push({ text: parts.join(''), type: (opts || {}).type }); return new realBlob(parts, opts); };

    const t = mkTrack();
    const r = await load('baja/bio/protein/motif-impact-view.js', graph, t, { result: RESULT });
    ok(r && r.ok, 'the window opens from a scan payload');
    ok(r.rows.length === 6, 'every record is a row: ' + r.rows.length);

    // ---- THE THREE CLAIMS STAY APART -------------------------------------------------
    const by = (e) => r.rows.filter((x) => x.effect === e);
    ok(by('gained').length === 2 && by('lost').length === 1 && by('present').length === 3,
       'gained, lost and already-present are counted separately: '
       + by('gained').length + '/' + by('lost').length + '/' + by('present').length);
    ok(by('gained').every((x) => x.upper),
       'every gained row carries the upper-bound flag the scan put on it');
    ok(by('lost')[0].variant === 'A315T', 'a lost motif says which variant destroyed it');
    ok(by('present').some((x) => x.below),
       'a wild-type motif below the cutoff is kept, because a variant destroys it');

    const panel = document.getElementById('motif-impact-view');
    const text = () => (panel ? panel.textContent : '');
    ok(!!panel, 'the panel is on the page');
    ok(/2 gained/.test(text()) && /1 lost/.test(text()) && /3 already present/.test(text()),
       'and says the three counts at the top');
    ok(/UPPER BOUND/.test(text()), 'the caveats are in the window, not behind a help button');
    ok(/TARDBP/.test(text()) && /414/.test(text()), 'with the protein it is about');

    // ---- THE MAP ---------------------------------------------------------------------
    // Three lanes, one per claim, each bar placed by residue. A bar in the wrong lane is
    // a gain drawn as a loss.
    const bars = panel.querySelectorAll('[data-elm]');
    ok(bars.length === 6, 'a bar per row on the map: ' + bars.length);
    const gsk = Array.from(bars).filter((b) => b.getAttribute('data-elm') === 'MOD_GSK3_1')[0];
    ok(!!gsk && /left:\s*75\.3/.test(gsk.style.cssText),
       'placed where it is on the protein: ' + (gsk && gsk.style.left));

    // ---- THE FILES -------------------------------------------------------------------
    const csv = r.csv();
    ok(/^#/.test(csv) && /min score 0.5/.test(csv) && /scoring model/.test(csv),
       'the CSV carries the settings the scan ran under');
    ok(/UPPER BOUND/.test(csv), 'and the caveats, so a file opened later still says what it is');
    ok(/score_is_upper_bound/.test(csv.split('\n').filter((l) => !/^#/.test(l))[0]),
       'the upper-bound flag is a column of its own, not a footnote');
    const dataLines = csv.trim().split('\n').filter((l) => !/^#/.test(l));
    ok(dataLines.length === 7, 'a header and six rows: ' + dataLines.length);
    ok(/^gained,A315T,MOD_GSK3_1/.test(dataLines[1]), 'rows read effect first: ' + dataLines[1]);
    const j = JSON.parse(r.json());
    ok(j.rows.length === 6 && j.track === 'TARDBP' && j.caveats.length === 2,
       'the JSON holds the rows, the track and the caveats');

    const btn = Array.from(panel.querySelectorAll('button'))
        .filter((b) => /Download CSV/.test(b.textContent))[0];
    ok(!!btn, 'there is a download button');
    btn.click();
    ok(saved.length === 1 && saved[0].name === 'TARDBP_motif_impact.csv',
       'and it writes a file named for the track: ' + (saved[0] && saved[0].name));
    ok(blobs.length && /MOD_GSK3_1/.test(blobs[blobs.length - 1].text),
       'with the rows in it');

    // ---- THE TABLE -------------------------------------------------------------------
    const rowsIn = () => panel.querySelectorAll('[data-row]').length;
    ok(rowsIn() === 6, 'the table lists them all to begin with: ' + rowsIn());
    const gainedBtn = Array.from(panel.querySelectorAll('button'))
        .filter((b) => b.textContent === 'Gained')[0];
    gainedBtn.click();
    ok(rowsIn() === 2, 'the Gained filter leaves the gains: ' + rowsIn());
    const allBtn = Array.from(panel.querySelectorAll('button')).filter((b) => b.textContent === 'All')[0];
    allBtn.click();
    const find = panel.querySelector('input');
    find.value = 'sumo'; find.oninput();
    ok(rowsIn() === 1, 'and the search finds a class by name whatever its case: ' + rowsIn());
    find.value = 'nothing-like-this'; find.oninput();
    ok(rowsIn() === 0 && /Nothing matches that/.test(text()),
       'an empty search says so rather than looking like an empty result');
    find.value = ''; find.oninput();

    // ---- WHAT IS REFUSED, AND WHY --------------------------------------------------
    // A track with no protein is not an empty report: translating it in some arbitrary
    // frame would answer a question about a sequence nobody has.
    said.length = 0;
    const noPep = { name: 'NOPEP', annotations: [{ protein: 'p.A1T' }], track_layers: [] };
    const r2 = await load('baja/bio/protein/motif-impact-view.js', graph, noPep, {});
    ok(r2 && !r2.ok && r2.why === 'no protein', 'a track with no ORF is refused by name');
    ok(said.some((m) => /no ORF/.test(m)), 'and told why: ' + (said[0] || ''));

    said.length = 0;
    const r3 = await load('baja/bio/protein/motif-impact-view.js', graph,
        { name: 'E', annotations: [], track_layers: [] }, { protein: 'MKV', ask: false });
    ok(r3 && !r3.ok && r3.why === 'no variants', 'a track with no coding variants is refused too');

    // A scan that could not run on the host is a deployment problem, not a quiet nothing.
    said.length = 0;
    const r4 = await load('baja/bio/protein/motif-impact-view.js', graph, mkTrack(),
        { result: { error: 'no ELM tables on this host' } });
    ok(r4 && !r4.ok && /ELM tables/.test(r4.why), 'a host without the ELM tables says so');
    ok(said.some((m) => /ELM tables/.test(m)), 'out loud');

    // ---- CHOOSING THE VARIANTS -------------------------------------------------------
    // A track carrying forty ClinVar entries is the normal case; a report on all forty is
    // a wall of rows nobody asked for. The set is chosen, and what each variant IS comes
    // with it so the list can be narrowed before choosing.
    const t2 = mkTrack();
    const started = [];
    const scan = global.lion_engine.exec;
    let pickItems = null;
    global.lion_engine.exec = async (p, ...a) => {
        if (/pick-list\.js$/.test(p)) {
            pickItems = a[0];
            setTimeout(() => a[0].onPick(a[0].items.filter((x) => /Pathogenic/.test(x.sub || ''))), 0);
            return true;
        }
        if (/slim-scan\.py$/.test(p)) { started.push(a[1]); return RESULT; }
        return scan(p, ...a);
    };
    const r5 = await load('baja/bio/protein/motif-impact-view.js', graph, t2,
        { protein: 'M'.repeat(414) });
    ok(!!pickItems && pickItems.multi === true, 'the variants are chosen, many at once');
    ok(pickItems.items.length === 3 && pickItems.items.some((x) => x.label === 'A315T'),
       'every coding variant on the track is offered: '
       + (pickItems.items || []).map((x) => x.label).join(', '));
    ok(pickItems.items.filter((x) => /Pathogenic/.test(x.sub || '')).length === 2,
       'with what each one is, so the list can be narrowed to the pathogenic ones');
    ok(started[0] === 'A315T,M337V', 'and only the chosen ones are scanned: ' + started[0]);
    ok(r5 && r5.ok, 'the report is made from them');

    // Dismissing the picker makes no report, and says so.
    said.length = 0;
    global.lion_engine.exec = async (p, ...a) => {
        if (/pick-list\.js$/.test(p)) { setTimeout(() => a[0].onClose(), 0); return true; }
        if (/slim-scan\.py$/.test(p)) { started.push('SHOULD NOT RUN'); return RESULT; }
        return scan(p, ...a);
    };
    const r6 = await load('baja/bio/protein/motif-impact-view.js', graph, mkTrack(),
        { protein: 'M'.repeat(414) });
    ok(r6 && !r6.ok && r6.why === 'dismissed', 'closing the picker makes no report');
    ok(started.indexOf('SHOULD NOT RUN') < 0, 'and runs no scan');
    global.lion_engine.exec = scan;

    // ---- THE WAYS IN -----------------------------------------------------------------
    const menu = fs.readFileSync('baja/manchester/menu/mouse-over-highlight.js', 'utf8');
    ok(/Motif impact report/.test(menu) && /motif-impact-view\.js/.test(menu),
       'the track menu offers it');
    const caps = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8');
    ok(/name: 'motif_impact_report'/.test(caps) && /motif-impact-view\.js/.test(caps),
       'and it can be asked for in words');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
