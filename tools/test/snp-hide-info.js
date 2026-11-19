// HIDE INFO, AND ONLY WHILE THERE IS SOMETHING TO HIDE.
//
//     node tools/test/snp-hide-info.js
//
// More information leaves a callout pinned to the variant, which is the point of it: it is
// what marks the variant on the canvas afterwards. There was no way to take that one callout
// off again. The only thing close was "Toggle annotations on selected variants", which acts
// on every highlighted variant across every track -- not what someone wants when a single
// callout is sitting over the sequence they are trying to read.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
// core.js defines CurrentLayout itself and reads the panel through lion_engine, so the
// engine stub supplies it rather than the test shadowing core's own object.
global.lion_engine = {
    exec: (p, ...a) => load(p, ...a),
    createIonFunction: (f) => f,
    getStashed: () => ({}),
    setStashed: () => { },
    pushHistory: () => { }
};

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const mk = (over) => {
    const snp = Object.assign({
        name: 'rs1567203083', id: 'rs1567203083', xi: 100, xf: 101,
        reference: 'C', alternate: 'T', highlight: true
    }, over || {});
    const track = {
        name: 'MAPK8IP3-216', description: 'MAPK8IP3;MAPK8IP3-216', chr: '16',
        snpindels: [snp], tgraph: { X: (v) => v, yi: 0 }
    };
    const graph = {
        track: [track], woke: 0, menuClosed: 0,
        wake() { this.woke++; }, showSideMenu(v) { if (v === null) this.menuClosed++; },
        animateTo: () => Promise.resolve(), setMessage: () => { }
    };
    return { snp, track, graph };
};
const labels = (m) => m.map((x) => x && x.label);
const item = (m, label) => m.filter((x) => x && x.label === label)[0] || null;

(async () => {
    // ---- while the callout is on screen -------------------------------------------------
    let { snp, track, graph } = mk({ annotation: 'changes one residue', showAnnotation: true });
    let menu = await load('baja/manchester/menu/snp-menu.js', graph, track, snp);
    ok(!!item(menu, 'Hide information'),
       'the entry is there when the callout is showing: ' + JSON.stringify(labels(menu).slice(0, 5)));

    // A variant that has an annotation and was never explicitly shown still DRAWS its
    // callout -- snpindel.js tests showAnnotation !== false, so undefined draws. The menu
    // has to agree with the canvas about what is on screen.
    ({ snp, track, graph } = mk({ annotation: 'changes one residue' }));
    menu = await load('baja/manchester/menu/snp-menu.js', graph, track, snp);
    ok(!!item(menu, 'Hide information'),
       'and when showAnnotation was never set, which still draws');

    // ---- and not otherwise ----------------------------------------------------------------
    ({ snp, track, graph } = mk({ annotation: 'changes one residue', showAnnotation: false }));
    menu = await load('baja/manchester/menu/snp-menu.js', graph, track, snp);
    ok(!item(menu, 'Hide information'), 'not there once it is hidden');

    ({ snp, track, graph } = mk({}));
    menu = await load('baja/manchester/menu/snp-menu.js', graph, track, snp);
    ok(!item(menu, 'Hide information'),
       'and not there for a variant that has nothing to show: ' + JSON.stringify(labels(menu).slice(0, 4)));

    // ---- what it does ----------------------------------------------------------------------
    ({ snp, track, graph } = mk({ annotation: 'changes one residue', showAnnotation: true }));
    const other = { annotation: 'something else', showAnnotation: true, highlight: true };
    track.snpindels.push(other);
    menu = await load('baja/manchester/menu/snp-menu.js', graph, track, snp);
    await item(menu, 'Hide information').click(0, 0);
    ok(snp.showAnnotation === false, 'clicking it hides this callout');
    ok(other.showAnnotation === true,
       'and only this one, unlike the bulk toggle that acts on every highlighted variant');
    ok(snp.annotation === 'changes one residue',
       'the text is kept, so bringing it back does not mean looking it up again');
    ok(graph.woke > 0, 'the canvas is redrawn, or it would still look like it is showing');
    ok(graph.menuClosed > 0, 'and the menu closes, like every other entry in it');

    // ---- it sits with the entry it undoes ---------------------------------------------------
    ({ snp, track, graph } = mk({ annotation: 'x', showAnnotation: true }));
    menu = await load('baja/manchester/menu/snp-menu.js', graph, track, snp);
    const L = labels(menu);
    ok(L.indexOf('Hide information') === L.indexOf('More information') + 1,
       'directly under More information, which is what puts the callout there: '
       + JSON.stringify(L.slice(0, 4)));

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
