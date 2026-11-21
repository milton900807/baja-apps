// WHERE A GENE IS CONSERVED, ACROSS EVERY SPECIES AT ONCE.
//
//     node tools/test/conservation-map.js
//
// "I want to understand and visually plot the highly conserved regions across all
// transcripts." A list of homologs with one percentage each says how alike two proteins
// are overall and nothing about WHERE, and a protein 60% identical because two domains
// are perfect is a different protein from one 60% identical because every residue is a
// coin flip.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'https://gene.clinic/', pretendToBeVisual: true });
Object.defineProperty(dom.window, 'innerWidth', { value: 1400, configurable: true });
Object.defineProperty(dom.window, 'innerHeight', { value: 900, configurable: true });
global.window = dom.window; global.document = dom.window.document;
global.navigator = dom.window.navigator;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let pyAsked = null, pyReply = null;
const load = async (p, ...a) => {
    const path = '' + p;
    if (path.indexOf('homolog-conservation.py') >= 0) { pyAsked = a.slice(); return pyReply; }
    if (path.indexOf('load-by-name.js') >= 0) return 0;
    const f0 = fs.existsSync(path) ? path : (fs.existsSync(path + '.js') ? path + '.js' : path);
    const src = fs.readFileSync(f0, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// 40 residues: a perfect block at 11-20, one break at 15 in one species only, and a
// tail nothing aligns to.
const L = 40;
const perfect = '='.repeat(L);
const mouse = ('='.repeat(10) + '====.=====' + '='.repeat(10) + '+'.repeat(10));
const fly = ('.'.repeat(10) + '=========='        /* the conserved block */
           + '+'.repeat(10) + '-'.repeat(10));
const model = {
    status: 'OK',
    gene: 'SPAG9', species: 'human', kind: 'orthologues', length: L, scoring: 'BLOSUM62',
    note: '3 species, 40 residues, 1 conserved block at 90% or better',
    species_rows: [
        { symbol: 'SPAG9', species: 'macaca_mulatta', species_common: 'rhesus macaque',
          identity: 98.4, states: perfect },
        { symbol: 'Spag9', species: 'mus_musculus', species_common: 'mouse',
          identity: 96.6, states: mouse },
        { symbol: 'syd', species: 'drosophila_melanogaster', species_common: 'fly',
          identity: 45.0, states: fly }
    ],
    profile: (() => {
        const n = 3, ident = [], simil = [], aligned = [];
        for (let i = 0; i < L; i++) {
            let id = 0, si = 0, al = 0;
            for (const st of [perfect, mouse, fly]) {
                const c = st[i];
                if (c === '-') continue;
                al++; if (c === '=') { id++; si++; } else if (c === '+') si++;
            }
            ident.push(id); simil.push(si); aligned.push(al);
        }
        return { identical: ident, similar: simil, aligned: aligned, n: n };
    })(),
    blocks: [{ start: 11, end: 20, length: 10, identity: 1, similarity: 1, peak: 1 }]
};

(async () => {
    const made = await load('baja/bio/conservation-map.js', { setMessage() { } }, model);
    ok(!!made, 'the map is drawn');
    const el = document.getElementById('baja-conservation-map');
    ok(!!el && /inset:\s*0/.test(el.style.cssText), 'full screen, like the list it comes from');
    const svg = el.querySelector('svg');
    ok(!!svg, 'as a picture');

    const t = el.textContent;
    ok(/Conservation of SPAG9/.test(t), 'titled for the gene');
    ok(/rhesus macaque/.test(t) && /mouse/.test(t) && /fly/.test(t),
       'one row per species, named');
    ok(/SPAG9/.test(t) && /Spag9/.test(t) && /syd/.test(t),
       'with the gene each row actually is, since the symbol differs by species');
    ok(/BLOSUM62/.test(t),
       'and which scoring decided what counts as similar, rather than leaving it implied');

    // FOUR STATES, FOUR COLOURS. A stretch that is similar but never identical is a domain
    // under selection and looks nothing like one that is half identical, half unaligned.
    const fills = Array.from(svg.querySelectorAll('rect')).map((r) => r.getAttribute('fill'));
    ok(fills.some((f) => f === '#2f9e6f'), 'identical has its own colour');
    ok(fills.some((f) => f === '#8fbf4d'), 'a conservative substitution has its own colour');
    ok(fills.some((f) => f === '#b4553f'), 'a different residue has its own colour');
    ok(fills.some((f) => /159,196,212/.test('' + f)), 'and so does nothing aligned there');
    ok(/identical/.test(t) && /conservative substitution/.test(t) && /nothing aligned there/.test(t),
       'all four are in the key, so the picture can be read without being explained');

    // The conserved block is marked once under the band, not on every lane.
    const marks = Array.from(svg.querySelectorAll('rect[fill="#1aa3bd"]'));
    ok(marks.length === 1, 'the conserved block is marked once: ' + marks.length);
    const title = marks[0] && marks[0].querySelector('title');
    ok(title && /11–20/.test(title.textContent) && /10 residues/.test(title.textContent),
       'and says which residues it is: ' + (title ? title.textContent : ''));

    // The block list holds the numbers.
    el.querySelector('button[data-id="blocks"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const panel = el.querySelector('[data-id="blocks-panel"]');
    ok(panel && panel.style.display === 'block', 'the blocks open on the button');
    ok(/11–20/.test(panel.textContent) && /10 residues/.test(panel.textContent),
       'with the residue numbers: ' + panel.textContent.slice(0, 80));

    // ---- a column of pixels takes the WORST residue it covers --------------------------
    // 40 residues across a thousand pixels is fine; the case that matters is the reverse,
    // where one broken residue inside a perfect domain must not be averaged away.
    Object.defineProperty(dom.window, 'innerWidth', { value: 300, configurable: true });
    const long = { gene: 'X', species: 'human', length: 4000, scoring: 'BLOSUM62',
        species_rows: [{ symbol: 'x', species: 's', species_common: 'thing', identity: 90,
            states: '='.repeat(2000) + '.' + '='.repeat(1999) }],
        profile: { identical: new Array(4000).fill(1), similar: new Array(4000).fill(1),
            aligned: new Array(4000).fill(1), n: 1 },
        blocks: [] };
    long.profile.identical[2000] = 0; long.profile.similar[2000] = 0;
    try { window.__bajaConservationMap.destroy(); } catch (e) { }
    await load('baja/bio/conservation-map.js', { setMessage() { } }, long);
    const el2 = document.getElementById('baja-conservation-map');
    const f2 = Array.from(el2.querySelectorAll('svg rect')).map((r) => r.getAttribute('fill'));
    ok(f2.some((f) => f === '#b4553f'),
       'one unconserved residue in four thousand still shows at 300px wide, because a '
       + 'column takes the worst it covers rather than a sample');

    // ---- it leaves as a file --------------------------------------------------------------
    let saved = null;
    const realCreate = document.createElement.bind(document);
    document.createElement = (tag) => {
        const n = realCreate(tag);
        if (('' + tag).toLowerCase() === 'a') n.click = () => { saved = n.download; };
        return n;
    };
    try { window.URL.createObjectURL = () => 'blob:x'; window.URL.revokeObjectURL = () => { }; } catch (e) { }
    el2.querySelector('button[data-id="svg"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    document.createElement = realCreate;
    ok(/^conservation-X\.svg$/.test(saved || ''), 'the SVG downloads under the gene’s name: ' + saved);

    try { el2.querySelector('button[data-id="close"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); } catch (e) { }
    ok(!document.getElementById('baja-conservation-map'), 'Close puts it away');

    // ---- reached from the homolog list ----------------------------------------------------
    const graph = { said: [], setMessage(m) { this.said.push('' + m); } };
    pyReply = model;
    await load('baja/bio/homologs-screen.js', graph, {}, {
        gene: 'SPAG9', species: 'human', kind: 'orthologues',
        homologs: [{ symbol: 'Spag9', id: 'E1', identity: 95.6, identity_query: 95.6,
            identity_target: 95.6, species: 'mus_musculus', species_common: 'mouse',
            loadable: true, description: 'x', chromosome: '11', start: 1, end: 2, strand: 1 }]
    });
    const list = document.getElementById('baja-homolog-screen');
    const cbtn = list.querySelector('button[data-id="conservation"]');
    ok(!!cbtn, 'the list offers the map');
    cbtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    // The handler awaits the lookup and then the drawing, so one tick is not enough.
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
    ok(pyAsked && pyAsked[0] === 'SPAG9' && pyAsked[2] === 'orthologues',
       'which asks for the same gene and the same kind: ' + JSON.stringify(pyAsked && pyAsked.slice(0, 3)));
    ok(!!document.getElementById('baja-conservation-map'), 'and the map opens');
    ok(!!document.getElementById('baja-homolog-screen'),
       'over the list rather than instead of it, so Escape comes back to what it is about');

    // ---- asked for in a sentence, not only from the list ---------------------------------
    // "show spag9 conservation map" was read as draw_similarity_map and refused for naming
    // only one track. That operation compares two tracks that are both open; this question
    // names one, because the others are not on the canvas at all.
    const trk = { name: 'SPAG9_mRNA', xi: 0, xf: 5000, track_layers: [], annotations: [],
        getSelectedRanges: () => [] };
    const g2 = { track: [trk], said: [], getTracks: () => [trk],
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); } };
    const C = await load('baja/manchester/menu/editor-capabilities.js', g2, {});
    ok(C.catalogue().some((c) => c.name === 'conservation_map'),
       'the editor has it as an operation of its own');

    let p = C.preview({ capability: 'conservation_map', args: { track: 'SPAG9_mRNA' } });
    ok(!p.blocker, 'ONE track is enough: ' + (p.blocker || '(none)'));
    ok(/map where SPAG9 is conserved/.test(p.text), 'and it says so: ' + p.text);
    ok(/takes a few seconds/.test(p.text),
       'with the wait named before the button, since Ensembl aligns on demand');

    pyAsked = null; pyReply = model;
    try { window.__bajaConservationMap.destroy(); } catch (e) { }
    await p.capability.run(p.args);
    ok(pyAsked && pyAsked[0] === 'SPAG9' && pyAsked[2] === 'orthologues',
       'orthologs by default, which is what conservation nearly always means: '
       + JSON.stringify(pyAsked && pyAsked.slice(0, 3)));
    ok(!!document.getElementById('baja-conservation-map'), 'and the map opens straight away');
    try { window.__bajaConservationMap.destroy(); } catch (e) { }

    await C.preview({ capability: 'conservation_map',
        args: { track: 'SPAG9_mRNA', across: 'paralogs' } }).capability.run(
        { track: 'SPAG9_mRNA', across: 'paralogs' });
    ok(pyAsked[2] === 'paralogues', 'and the family can be asked for instead: ' + pyAsked[2]);
    try { window.__bajaConservationMap.destroy(); } catch (e) { }

    // Nothing to stack is an answer about the gene, not an error.
    pyReply = { status: 'OK', gene: 'X', species: 'human', length: 0, species_rows: [],
        profile: {}, blocks: [], note: 'no aligned homolog came back for X' };
    g2.said = [];
    await C.preview({ capability: 'conservation_map', args: { track: 'SPAG9_mRNA' } })
        .capability.run({ track: 'SPAG9_mRNA' });
    ok(!document.getElementById('baja-conservation-map'), 'no empty map is opened');
    ok(/no aligned homolog/.test(g2.said.join(' ')),
       'and the reason is said: ' + g2.said.join(' | '));

    // The two-track map must stop catching this sentence.
    const caps = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8').replace(/\s+/g, ' ');
    ok(/conservation ACROSS SPECIES from one track[^$]{0,80}use conservation_map instead/.test(caps),
       'draw_similarity_map says when it is not the one meant');
    const plan = fs.readFileSync('py/bio/editor/plan.py', 'utf8');
    ok(/CONSERVATION ACROSS SPECIES IS conservation_map/.test(plan),
       'and the planner is told the same');

    // ---- it is a PROTEIN map, and it says whose transcript it started from -------------
    // "are these transcripts? if so are you showing exons anywhere" -- they are proteins,
    // which nothing on the picture said, and the exons were nowhere.
    try { window.__bajaConservationMap.destroy(); } catch (e) { }
    const withSrc = JSON.parse(JSON.stringify(model));
    withSrc.source = { track: 'SPAG9_mRNA', transcript: 'ENST00000262013.12', residues: L,
        exons: [{ n: 1, start: 1, end: 12 }, { n: 2, start: 13, end: 26 },
                { n: 3, start: 27, end: 40 }] };
    await load('baja/bio/conservation-map.js', { setMessage() { } }, withSrc);
    const e3 = document.getElementById('baja-conservation-map');
    const t3 = e3.textContent;
    ok(/PROTEIN/.test(t3) && /one amino acid, not one base/.test(t3),
       'it says it is a protein map, so 1,321 columns for a 6 kb transcript is explained');
    ok(/starts from SPAG9_mRNA \(ENST00000262013\.12\)/.test(t3)
       && /the track on your canvas/.test(t3),
       'and names the transcript on the canvas it started from: '
       + (/It starts from[^.]*/.exec(t3) || [''])[0]);

    const exonBars = Array.from(e3.querySelectorAll('svg rect'))
        .filter((r) => /26,163,189/.test('' + r.getAttribute('fill')));
    ok(exonBars.length === 3, 'the exons are drawn, one bar each: ' + exonBars.length);
    const ttl = exonBars[1] && exonBars[1].querySelector('title');
    ok(ttl && /exon 2 \u00b7 residues 13\u201326/.test(ttl.textContent),
       'in residue coordinates, since residue k is codon k: ' + (ttl ? ttl.textContent : ''));
    ok(/lane of numbered blocks is the transcript/.test(t3), 'and the key says what the lane is');

    // A DIFFERENT TRANSCRIPT IS NOT DRAWN. The track on the canvas may not be the one
    // Ensembl aligned, and boundaries from another protein would be confidently wrong.
    try { window.__bajaConservationMap.destroy(); } catch (e) { }
    const wrongSrc = JSON.parse(JSON.stringify(withSrc));
    wrongSrc.source.residues = L + 40;
    await load('baja/bio/conservation-map.js', { setMessage() { } }, wrongSrc);
    const e4 = document.getElementById('baja-conservation-map');
    ok(!Array.from(e4.querySelectorAll('svg rect'))
        .some((r) => /26,163,189/.test('' + r.getAttribute('fill'))),
       'exon bars are dropped when the track is a different transcript');
    ok(/different transcripts and the exon boundaries are not drawn/.test(e4.textContent),
       'and the reason is on the picture: '
       + (/the track is[^.]*/.exec(e4.textContent) || [''])[0]);
    try { window.__bajaConservationMap.destroy(); } catch (e) { }

    // ---- the track's missense variants, on the residues they change ---------------------
    // "if missense mutations are on the track make sure to carry over the annotations to
    // these proteins". A variant standing over a column where every species agrees is a
    // different proposition from one where none do, and that comparison is the point.
    try { window.__bajaConservationMap.destroy(); } catch (e) { }
    const withVars = JSON.parse(JSON.stringify(withSrc));
    withVars.source.variants = [
        { residue: 15, from: 'R', to: 'C', label: 'R15C', id: 'rs1' },
        { residue: 33, from: 'K', to: 'E', label: 'K33E', id: '' }
    ];
    withVars.source.variants_skipped = { synonymous: 2, nonsense: 0, indel: 1, outside: 0 };
    await load('baja/bio/conservation-map.js', { setMessage() { } }, withVars);
    const e5 = document.getElementById('baja-conservation-map');
    const dots = Array.from(e5.querySelectorAll('svg circle'));
    ok(dots.length === 2, 'one mark per missense variant: ' + dots.length);
    const dt = dots[0].querySelector('title').textContent;
    ok(/R15C/.test(dt) && /rs1/.test(dt), 'named as the protein change it is: ' + dt);
    ok(/of 3 species identical here/.test(dt),
       'and says what the species do at that residue, which is the comparison worth making: '
       + dt);
    ok(/2 missense variants from the track are marked/.test(e5.textContent),
       'the header says they were carried over');
    ok(/a dot is a missense variant/.test(e5.textContent), 'and the key says what a dot is');

    // Only missense: the rest are not points on a residue, and are named rather than dropped.
    try { window.__bajaConservationMap.destroy(); } catch (e) { }
    const noneCarried = JSON.parse(JSON.stringify(withSrc));
    noneCarried.source.variants_skipped = { synonymous: 3, nonsense: 1, indel: 2, outside: 0 };
    await load('baja/bio/conservation-map.js', { setMessage() { } }, noneCarried);
    const e6 = document.getElementById('baja-conservation-map');
    ok(!e6.querySelectorAll('svg circle').length, 'nothing is drawn when nothing is missense');
    ok(/3 synonymous/.test(e6.textContent) && /1 nonsense/.test(e6.textContent)
       && /2 indels/.test(e6.textContent),
       'and what was left off is named: ' + (/No missense[^.]*/.exec(e6.textContent) || [''])[0]);

    // A different transcript means the residue numbers point at the wrong columns.
    try { window.__bajaConservationMap.destroy(); } catch (e) { }
    const wrongVars = JSON.parse(JSON.stringify(withVars));
    wrongVars.source.residues = L + 40;
    await load('baja/bio/conservation-map.js', { setMessage() { } }, wrongVars);
    ok(!document.getElementById('baja-conservation-map').querySelectorAll('svg circle').length,
       'variants are dropped with the exons when the track is a different transcript');
    try { window.__bajaConservationMap.destroy(); } catch (e) { }

    // The capability is what works the residues out, from the track's own reading frame.
    const capsrc = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8');
    ok(/THE VARIANTS ON THE TRACK, CARRIED ONTO THE PROTEIN/.test(capsrc),
       'the capability carries them over');
    ok(/if \(wt === mu\) \{ skipped\.synonymous\+\+; continue; \}/.test(capsrc),
       'a synonymous change alters no residue, so it is not one of them');
    ok(/if \(mu === '\*'\) \{ skipped\.nonsense\+\+; continue; \}/.test(capsrc),
       'and a nonsense change ends the protein rather than changing a residue in it');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
