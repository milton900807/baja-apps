// COLOURING AND DELETING A VARIANT FROM THE PAGE THAT DESCRIBES IT.
//
//     node tools/test/snp-more-info-actions.js          (needs jsdom)
//
// This page is where someone decides what a variant is worth, which is the moment they
// want to mark it or be rid of it. Until now that meant closing the page, finding the
// marker again on the canvas and opening its menu. Both actions are driven here, and so is
// the asking before a delete: the button sits under a paragraph somebody is reading, and a
// delete on the first press is a delete nobody meant.
const fs = require('fs');
const { JSDOM } = require('jsdom');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
global.EngineMonitor = function (f) { this.f = f; };

const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const DOSSIER = {
    error: '',
    variants: JSON.stringify([
        { key: 'v1', title: 'rs547979470', sections: [
            { heading: 'CLINICAL SUMMARY', text: 'uncertain significance, likely benign' }] },
        { key: 'v2', title: 'rs80356730', sections: [
            { heading: 'CLINICAL SUMMARY', text: 'pathogenic' }] }
    ])
};
const load = async (p, ...a) => {
    if (/variant-dossier\.py$/.test(p)) return DOSSIER;
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

function SnpIndel(id, xi) { this.id = id; this.xi = xi; this.reference = 'C'; this.alternate = 'T'; }
SnpIndel.MARKER_COLORS = [['#ff0000', 'Red'], ['#00ff00', 'Green']];

const said = [];
let woke = 0, history = 0;
const mk = () => {
    const a = new SnpIndel('rs547979470', 11022372), b = new SnpIndel('rs80356730', 11022400);
    const track = {
        name: 'TARDBP', contig: '1', snpindels: [a, b], description: 'TARDBP;TARDBP-201',
        removesnp(v) { const i = this.snpindels.indexOf(v); if (i >= 0) this.snpindels.splice(i, 1); }
    };
    return { track, a, b };
};
const graph = {
    setMessage: (m) => said.push(m), setResultMessage: (m) => said.push(m),
    wake: () => { woke++; }, rescale: () => { }, pushOntoHistory: () => { history++; }
};

(async () => {
    const { track, a, b } = mk();
    const picks = [{ ref: a, track: track }, { ref: b, track: track }];
    const made = await load('baja/manchester/menu/snp-more-info.js', graph, {}, picks);
    ok(made === true, 'the page opens');
    const panel = document.getElementById('baja-snp-info');
    ok(!!panel, 'and is on the page');

    // ---- COLOUR --------------------------------------------------------------------------
    const swatches = panel.querySelectorAll('[data-col]');
    ok(swatches.length === (SnpIndel.MARKER_COLORS.length + 1) * 2,
       'every card carries the palette and an Automatic: ' + swatches.length);
    ok(Array.from(swatches).some((s) => /background:#ff0000/.test(s.getAttribute('style'))),
       'taken from the variant class, so a variant and a layer called Red are the same red');
    const first = panel.querySelector('[data-col="v1:0"]');
    history = 0; woke = 0;
    first.onclick();
    ok(a.markerColor === '#ff0000', 'a swatch colours that variant: ' + a.markerColor);
    ok(b.markerColor == null, 'and no other');
    ok(history === 1, 'pushing history first, so undo puts the colour back');
    ok(woke === 1, 'and the canvas is told to redraw');
    ok(/marker colour: Red/.test(panel.textContent),
       'the page says what was set, since the canvas is behind it');
    panel.querySelector('[data-col="v1:auto"]').onclick();
    ok(a.markerColor === null && /automatic/.test(panel.textContent),
       'Automatic puts it back to the colour the track chooses');

    // ---- DELETE ASKS ONCE ------------------------------------------------------------------
    const del = panel.querySelector('[data-del="v2"]');
    ok(!!del, 'each card offers a delete');
    history = 0;
    del.onclick();
    ok(track.snpindels.length === 2, 'the first press deletes nothing');
    ok(/press again/.test(del.textContent), 'and says what the second one will do: ' + del.textContent);
    ok(history === 0, 'nothing is pushed onto history for a press that did nothing');
    del.onclick();
    ok(track.snpindels.length === 1 && track.snpindels.indexOf(b) < 0,
       'the second press removes that variant');
    ok(track.snpindels[0] === a, 'and leaves the other one alone');
    ok(history === 1, 'with history pushed first, so undo restores it');
    ok(del.disabled === true && /Deleted/.test(del.textContent), 'the button says so and stops');
    ok(/undo restores it/.test(panel.textContent), 'and the card says undo is the way back');
    // The card stays, faded: what somebody was reading does not vanish from under them.
    ok(panel.querySelectorAll('[data-act]').length === 2, 'the card is still there');
    const row = panel.querySelector('[data-act="v2"]');
    ok(row.parentNode.style.opacity === '0.45', 'faded rather than removed');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
