function () {

    // Reading and writing a design, into the same My Files drive as everything else:
    // /save-user-data to write, /load-file to read. A .tottenham design sits beside the
    // .baja screens and the .liverpool designs in the same browser.

    const EXT = '.tottenham';
    const TYPE = 'tottenham-mrna';
    const VERSION = 1;

    const host = () => (window['env'] && window['env']['apiUrl']) || '';

    // The inputs and the decisions are saved. The SCORES ARE NOT: every number this editor
    // shows is a pure function of the inputs and of the model registry as it stood when the
    // button was pressed, and the whole point of that registry is that better models get
    // added to it. A stored half-life index would be a number from a model that no longer
    // exists, sitting in a file that does not say so. Reopening recomputes with whatever is
    // registered now, which is the only behavior that stays honest as the models improve.
    const document_ = (state) => ({
        type: TYPE,
        version: VERSION,
        saved: new Date().toISOString(),
        name: state.name || '',
        design: {
            label: state.label || '',
            architecture: state.architecture || 'conventional',
            backbone: state.backbone || 'none',
            capType: state.capType || 'cap1',
            nucleoside: state.nucleoside || 'm1psi',
            utr5: state.utr5 || 'none',
            utr3: state.utr3 || 'none',
            utr5Custom: state.utr5Custom || '',
            utr3Custom: state.utr3Custom || '',
            polyA: state.polyA,
            polyAStyle: state.polyAStyle || 'plain',
            kozak: state.kozak !== false,
            stops: state.stops !== false,
            optimisePreset: state.optimisePreset || 'stability',
            gcTarget: state.gcTarget,
            sgpOverlap: state.sgpOverlap
        },
        payload: {
            // Whichever the designer supplied. Both are kept: a design entered as protein
            // should reopen as protein so re-optimising is still available.
            protein: state.protein || '',
            cdsInput: state.cdsInput || '',
            optimised: state.optimisedCds || ''
        },
        replicon: {
            cse5: state.cse5 || '', sgp: state.sgp || '',
            replicase: state.replicase || '', cse3: state.cse3 || ''
        },
        detargeting: (state.detargeting || []).slice(),
        acknowledgedVerify: !!state.acknowledgedVerify,
        notes: state.notes || ''
    });

    const save = async (state, spath, name) => {
        let n = ('' + (name || state.name || 'design')).trim();
        if (!n) n = 'design';
        if (n.toLowerCase().lastIndexOf(EXT) !== n.length - EXT.length) n += EXT;
        const doc = document_(state);
        doc.name = n;
        const rs = await POSTJSON({
            name: n, key: 'user', user: getUser(), spath: spath || '',
            value: JSON.stringify(doc)
        }, host() + '/save-user-data');
        if (rs && (rs.status === 'saved' || rs.path)) return { ok: true, path: rs.path || '', name: n };
        return { ok: false, message: (rs && rs.msg) ? rs.msg : 'the server did not confirm the save' };
    };

    const open = async (path) => {
        const rs = await POSTJSON({ path: path, key: 'user', user: getUser() }, host() + '/load-file');
        const text = (rs && (rs.value != null ? rs.value : rs.text)) || (typeof rs === 'string' ? rs : '');
        if (!text) return { ok: false, message: 'the file came back empty' };
        let doc;
        try { doc = (typeof text === 'string') ? JSON.parse(text) : text; }
        catch (e) { return { ok: false, message: 'this file is not a Tottenham design (it is not JSON)' }; }
        if (!doc || doc.type !== TYPE) {
            return { ok: false, message: 'this is not a Tottenham design file' + (doc && doc.type ? ' (it says it is a ' + doc.type + ')' : '') };
        }
        if (doc.version > VERSION) {
            return { ok: false, message: 'this design was written by a newer version of the editor (version ' + doc.version + '); this one reads up to ' + VERSION };
        }
        return { ok: true, doc: doc };
    };

    const toState = (doc) => {
        const d = doc.design || {}, p = doc.payload || {}, r = doc.replicon || {};
        return {
            name: doc.name || '', label: d.label || '',
            architecture: d.architecture || 'conventional',
            backbone: d.backbone || 'none',
            capType: d.capType || 'cap1',
            nucleoside: d.nucleoside || 'm1psi',
            utr5: d.utr5 || 'none', utr3: d.utr3 || 'none',
            utr5Custom: d.utr5Custom || '', utr3Custom: d.utr3Custom || '',
            polyA: (typeof d.polyA === 'number') ? d.polyA : 120,
            polyAStyle: d.polyAStyle || 'plain',
            kozak: d.kozak !== false, stops: d.stops !== false,
            optimisePreset: d.optimisePreset || 'stability',
            gcTarget: (typeof d.gcTarget === 'number') ? d.gcTarget : null,
            sgpOverlap: (typeof d.sgpOverlap === 'number') ? d.sgpOverlap : 5,
            protein: p.protein || '', cdsInput: p.cdsInput || '', optimisedCds: p.optimised || '',
            cse5: r.cse5 || '', sgp: r.sgp || '', replicase: r.replicase || '', cse3: r.cse3 || '',
            detargeting: doc.detargeting || [],
            acknowledgedVerify: !!doc.acknowledgedVerify,
            notes: doc.notes || ''
        };
    };

    return { EXT: EXT, TYPE: TYPE, VERSION: VERSION, save: save, open: open, toState: toState, document: document_ };
}
