// THE PARALOGS OF A TRACK, AS A SCREEN YOU LOAD FROM.
//
//     node tools/test/paralogs.js
//
// "list the closest paralog to this track" was refused: "not something the editor can do:
// this requires external database queries for homology relationships". The editor already
// talks to Ensembl for every gene it loads, and listing is only half of what is wanted --
// the point of finding a paralog is putting it beside the track you asked from.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let pyAsked = null, pyReply = null, loaded = [];
const load = async (p, ...a) => {
    const path = '' + p;
    if (path.indexOf('paralogs.py') >= 0) { pyAsked = a.slice(); return pyReply; }
    if (path.indexOf('load-by-name.js') >= 0) { loaded.push(a[2] && a[2].name); return 0; }
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

const mk = (name) => ({ name: name, xi: 0, xf: 5000, track_layers: [], annotations: [],
    getSelectedRanges: () => [] });

(async () => {
    const A = mk('SPAG9_mRNA'), B = mk('MAPK8IP3_mRNA');
    const graph = { track: [A, B], said: [], getTracks: () => [A, B],
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); } };
    const C = await load('baja/manchester/menu/editor-capabilities.js', graph, {});

    ok(C.catalogue().some((c) => c.name === 'list_paralogs'),
       'the editor can do it now: it is in the catalogue');

    // ---- the gene comes off the track's name ---------------------------------------------
    let p = C.preview({ capability: 'list_paralogs', args: { track: 'SPAG9_mRNA' } });
    ok(!p.blocker, 'a track is enough: ' + (p.blocker || '(none)'));
    ok(/paralogs of SPAG9\b/.test(p.text),
       'and the gene is taken off the track name, without the _mRNA: ' + p.text);
    p = C.preview({ capability: 'list_paralogs', args: { track: 'SPAG9_mRNA', gene: 'JIP4' } });
    ok(/paralogs of JIP4/.test(p.text), 'a gene said outright wins over the track name');

    // ---- the lookup, and the screen -------------------------------------------------------
    pyReply = { status: 'OK', gene: 'SPAG9', species: 'human', count: 2, note: '',
        paralogs: [
            { symbol: 'MAPK8IP3', id: 'ENSG00000138834', identity: 57.8, identity_query: 57.8,
              identity_target: 58.5, description: 'mitogen-activated protein kinase 8 interacting protein 3',
              chromosome: '16', start: 1706195, end: 1770351, strand: 1, length: 64157, subtype: 'Vertebrata' },
            { symbol: 'MAPK8IP1', id: 'ENSG00000121653', identity: 22.4, identity_query: 22.4,
              identity_target: 41.2, description: 'MAPK8 interacting protein 1',
              chromosome: '11', start: 45894000, end: 45908000, strand: -1, length: 14000, subtype: 'gene_split' }
        ] };
    p = C.preview({ capability: 'list_paralogs', args: { track: 'SPAG9_mRNA' } });
    const r = await p.capability.run(p.args);
    ok(pyAsked && pyAsked[0] === 'SPAG9' && pyAsked[1] === 'human',
       'Ensembl is asked for that gene: ' + JSON.stringify(pyAsked));
    ok(r && r.status === 'OK', 'and the answer comes back');

    const screen = document.getElementById('baja-paralog-screen');
    ok(!!screen, 'a screen is opened, not a sentence');
    ok(/inset:\s*0/.test(screen.style.cssText), 'and it is full screen');
    const text = screen.textContent;
    ok(/Paralogs of SPAG9/.test(text), 'titled for the gene: ' + text.slice(0, 40));
    ok(/MAPK8IP3/.test(text) && /MAPK8IP1/.test(text), 'with every paralog on it');
    ok(text.indexOf('MAPK8IP3') < text.indexOf('MAPK8IP1'), 'closest first');

    // Identity both ways: the case that matters is a short paralog inside a long one.
    ok(/57\.8% of SPAG9/.test(text) && /58\.5% of MAPK8IP3/.test(text),
       'identity is shown each way round: ' + (/[^·]*of SPAG9[^·]*·[^·]*/.exec(text) || [''])[0].trim());
    ok(/22\.4% of SPAG9/.test(text) && /41\.2% of MAPK8IP1/.test(text),
       'including the one that is close from one side only');
    ok(/gene split/.test(text) && /annotation artefact/.test(text),
       'a gene split is marked as an artefact rather than passing as a duplication');
    ok(/chr16:1,706,195/.test(text) && /64 kb/.test(text),
       'with where it sits and how big it is: ' + (/chr16[^·]*/.exec(text) || [''])[0]);

    // ---- every row loads -------------------------------------------------------------------
    const btns = screen.querySelectorAll('button[data-id="load"]');
    ok(btns.length === 2, 'every row loads: ' + btns.length + ' buttons');
    loaded = [];
    btns[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await new Promise((r2) => setTimeout(r2, 0));
    ok(loaded[0] === 'MAPK8IP3', 'pressing one loads that gene: ' + loaded.join(', '));
    ok(!document.getElementById('baja-paralog-screen'),
       'and the screen closes first, so it does not bury the transcript chooser the load opens');

    // ---- nothing found is an answer, not a failure -------------------------------------------
    pyReply = { status: 'OK', gene: 'TP53', species: 'human', count: 0, paralogs: [] };
    await C.preview({ capability: 'list_paralogs', args: { track: 'SPAG9_mRNA', gene: 'TP53' } })
        .capability.run({ track: 'SPAG9_mRNA', gene: 'TP53' });
    const s2 = document.getElementById('baja-paralog-screen');
    ok(!!s2 && /no paralogs for TP53/.test(s2.textContent),
       'a gene with none says so plainly: ' + (s2 ? s2.textContent.slice(0, 80) : ''));
    ok(/ordinary answer, not a failure/.test(s2.textContent),
       'and does not dress it up as an error');
    try { s2.querySelector('button[data-id="close"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); } catch (e) { }

    // ---- Ensembl having a bad day is said, not drawn ------------------------------------------
    pyReply = { status: 'ERROR', error: 'could not reach Ensembl (timed out)' };
    graph.said = [];
    await C.preview({ capability: 'list_paralogs', args: { track: 'SPAG9_mRNA' } })
        .capability.run({ track: 'SPAG9_mRNA' });
    ok(!document.getElementById('baja-paralog-screen'), 'no empty screen is opened on a failure');
    ok(/could not reach Ensembl/.test(graph.said.join(' ')),
       'the reason is passed through: ' + graph.said.join(' | '));

    // ---- the backend's own contract ------------------------------------------------------------
    const py = fs.readFileSync('py/bio/paralogs.py', 'utf8');
    ok(/sequence=none/.test(py) && !/format=condensed/.test(py.split('NOT format=condensed')[1] || ''),
       'the full homology record is asked for: the condensed one carries no identity at all, '
       + 'so "the closest" could not be answered from it');
    ok(/min\(vals\)/.test(py),
       'and the ordering takes the LOWER of the two directions, so a fragment cannot sort '
       + 'above a real counterpart on its better side');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
