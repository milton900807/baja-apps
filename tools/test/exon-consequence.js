// WHAT EACH EXON IS WORTH TO THE PROTEIN.
//
//     node tools/test/exon-consequence.js
//
// The coupling readout on a track is one number for the whole gene and has no exon in it,
// so it cannot say what losing exon 15 does. This asks it per exon, from the skip isoform.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
global.navigator = dom.window.navigator;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : p + '.js';
    const src = fs.readFileSync(path, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), createIonFunction: (f) => f, getIonFunction: (r) => r };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// A transcript built so the answers are known in advance.
//   exon 1  0..299     300 nt, holds the start codon at 60
//   exon 2  500..699   200 nt, NOT a multiple of 3 -> skipping it shifts the frame
//   exon 3  900..1199  300 nt, a multiple of 3     -> skipping it is an in-frame loss
//   exon 4  1400..1699 300 nt, in frame
//   exon 5  1900..2499 600 nt, holds the normal stop; last exon
// The filler is CTAACTAAC: in frame 0 it reads CTA ACT AAC and never stops, while EITHER
// shifted frame hits TAA within a codon or two. So a frameshift here terminates promptly,
// as one does in a real transcript, instead of running off the end as non-stop decay.
const mkTrack = (name) => {
    // EVERY EXON STARTS WHERE THE PATTERN LEFT OFF. The mRNA is the exons concatenated, so
    // an exon whose track position is out of phase with its mRNA position splices a new
    // codon into existence at the junction -- which is how a transcript built to have no
    // stop acquired one 80 codons in. Each start is chosen so start % 9 equals its mRNA
    // offset % 9, and the joined reading frame is then the filler's own, all the way.
    const spans = [[0, 300], [507, 200], [905, 300], [1403, 300], [1901, 600]];
    let seq = '';
    while (seq.length < 2700) seq += 'CTAACTAAC';
    seq = seq.slice(0, 2700).split('');
    const put = (at, s3) => { for (let i = 0; i < s3.length; i++) seq[at + i] = s3[i]; };
    put(60, 'ATG');            // start codon, in exon 1, at mRNA 60
    put(2301, 'TAA');          // the normal stop, in exon 5, at mRNA 1500
    const anns = [];
    spans.forEach((s, i) => anns.push({ type: 'Exon', index: i + 1, xi: s[0], xf: s[0] + s[1] - 1 }));
    anns.push({ type: 'Translation', xi: 60, xf: 2303, strand: '+' });
    return { name: name, xi: 0, xf: 2700, sequence: seq.join(''), annotations: anns,
        track_layers: [], markstart: -1, markend: -1, getSelectedRanges: () => [],
        addLayer(l) { this.track_layers.push(l); },
        tgraph: { X: (x) => x, Y: (y) => y, xi: 0, width: 2700, xmin: 0, xmax: 2700, yi: 0, height: 1,
            getymin: () => 0, getymax: () => 1 } };
};

(async () => {
    const t = mkTrack('DNM3');
    const steps = [];
    const rows = await load('baja/bio/orfs/exon-consequence-map.js', t, { onStep: (i, n) => steps.push(i + '/' + n) });

    ok(rows.length === 5, 'every exon gets a row: ' + rows.length);
    ok(steps.length === 5 && steps[0] === '1/5', 'and reports progress as it goes: ' + steps.join(' '));
    ok(rows.every((r) => r.index && r.label && isFinite(r.start) && isFinite(r.end)),
       'each row knows which exon it is and where');

    const by = (i) => rows.find((r) => r.index === i);
    ok(by(2).ok && by(2).outcome === 'ptc',
       'an exon whose length is not a multiple of 3 shifts the frame: ' + by(2).outcome + ' / ' + by(2).verdict);
    ok(by(3).ok && by(3).outcome === 'in-frame' && /in-frame loss of 100 aa/.test(by(3).verdict),
       'a 300 nt coding exon is a clean 100 aa loss: ' + by(3).verdict);
    ok(by(3).aaDelta === -100, 'and the protein is 100 aa shorter: ' + by(3).aaDelta);
    ok(by(2).ok && /PTC/.test(by(2).verdict),
       'and the frameshift reaches a premature stop: ' + by(2).verdict);

    // The ranking is the point of a map rather than a list.
    ok(by(2).severity < by(3).severity,
       'a frameshift outranks an in-frame loss: ' + by(2).severity + ' vs ' + by(3).severity);
    ok(rows.every((r) => r.severity != null), 'every row is ranked');

    // THE VERDICT IS THE ROW, not a sentence to read: the headline is still there for the
    // one row that earns reading.
    ok(by(3).headline && /In-frame deletion/.test(by(3).headline), 'the sentence is kept too: ' + by(3).headline);

    // ---- how often, which is a different claim from what -------------------------------
    ok(rows.every((r) => r.psi === null),
       'with no PSI run, how often each skip happens is NOT KNOWN rather than zero: '
       + JSON.stringify(rows.map((r) => r.psi)));

    const TrackLayer = await load('baja/bio/track-layer.js');
    const L = new TrackLayer('DNM3_psi_sashimi', 0, 0, 2700, 1);
    L.magnitudeMode = 'psi'; L.magMax = 1;
    L.junctions = [{ d: 299, a: 905, mag: 0.4, kind: 'skip', exon: 2, annotated: true },
                   { d: 299, a: 905, mag: 0.1, kind: 'skip', exon: 2, annotated: true }];
    t.track_layers.push(L);
    const rows2 = await load('baja/bio/orfs/exon-consequence-map.js', t, {});
    const r2 = rows2.find((r) => r.index === 2);
    ok(Math.abs(r2.skip - 0.4) < 1e-9 && Math.abs(r2.psi - 0.6) < 1e-9,
       'once PSI is on the track the rate is read off it, largest skip winning: '
       + r2.skip + ' / ' + r2.psi);
    ok(rows2.find((r) => r.index === 3).skip === 0,
       'an exon with no skip arc is constitutive, not unknown, once PSI has run');

    // ---- the screen ---------------------------------------------------------------------
    const went = [];
    const graph = { canvas: { width: 1200, height: 800 }, said: [],
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); },
        clearSequenceSelections() { }, wake() { }, zoomRect: () => Promise.resolve() };
    const pop = await load('baja/bio/orfs/exon-consequence-screen.js', graph, {}, {
        track: t, gene: 'DNM3', rows: rows2, onGo: (r) => { went.push(r.index); }
    });
    const el = document.getElementById('baja-exon-consequence');
    ok(!!el, 'the screen opens');
    ok(/what losing it does/i.test(el.textContent), 'saying what it is: ' + el.textContent.slice(0, 60));
    ok(/destroy the message/.test(el.textContent), 'with the count that matters first');
    // Worst first: the first data row is not exon 1.
    const shown = Array.from(el.querySelectorAll('tr[data-row]')).map((n) => +n.getAttribute('data-row'));
    const sevOf = (i) => rows2.find((r) => r.index === i).severity;
    ok(shown.every((n, i) => i === 0 || sevOf(shown[i - 1]) <= sevOf(n)),
       'sorted by what is at stake, not by position: ' + shown.map((n) => n + '(' + sevOf(n) + ')').join(' '));
    ok(shown.indexOf(3) > shown.indexOf(2),
       'so the in-frame loss sits below the frameshift: ' + shown.join(' '));
    // And position order is one click away.
    const orderBtn = el.querySelector('button[data-id="order"]');
    orderBtn.click();
    ok(el.querySelector('tr[data-row]').getAttribute('data-row') === '1',
       'in transcript order on request: ' + el.querySelector('tr[data-row]').getAttribute('data-row'));
    // The rate column distinguishes measured-zero from never-measured.
    ok(/skipped in 40%/.test(el.textContent), 'the measured rate is shown: ');
    ok(/constitutive/.test(el.textContent), 'and an exon nothing skips says so');

    // A row is a place.
    el.querySelector('tr[data-row="2"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    ok(went[0] === 2, 'clicking a row goes to that exon: ' + JSON.stringify(went));
    ok(!document.getElementById('baja-exon-consequence'), 'and closes the screen behind it');

    // ---- the operation --------------------------------------------------------------------
    const b = mkTrack('DNM3-208');
    const g2 = { track: [t, b], getTracks: () => [t, b], said: [],
        canvas: { width: 1200, height: 800 },
        grid: { getxmin: () => 0, getxmax: () => 100, getymin: () => -5, getymax: () => 5 },
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); },
        clearSequenceSelections() { }, wake() { }, showSideMenu() { },
        zoomRect: () => Promise.resolve(), viewAllTracks: () => Promise.resolve() };
    const C = await load('baja/manchester/menu/editor-capabilities.js', g2, {});
    const pv = C.preview({ capability: 'exon_protein_consequence', args: { track: 'DNM3' } });
    ok(!pv.blocker, 'the operation is there and not refused: ' + (pv.blocker || '(none)'));
    ok(/each of the 5 exons of DNM3/.test(pv.text) && /NMD/.test(pv.text),
       'and says what it will work out: ' + pv.text);
    const multi = C.preview({ capability: 'exon_protein_consequence', args: {} });
    ok(multi.choices && multi.choices.length === 2 && /5 exons/.test(multi.choices[0].detail),
       'two tracks open: one Go each: ' + (multi.choices || []).map((o) => o.detail).join(' | '));

    await pv.capability.run({ track: 'DNM3' });
    ok(!!document.getElementById('baja-exon-consequence'), 'running it opens the screen');
    ok(g2.said.some((m) => /5 exons assessed/.test(m)), 'and says what came of it: ' + g2.said.slice(-1)[0]);
    try { window.__bajaExonConsequence.destroy(); } catch (e) { }

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
