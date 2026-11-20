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

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
