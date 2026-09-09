function () {

    // READING AND WRITING A DESIGN, into the same My Files drive as everything else in the
    // application -- /save-user-data to write, /load-file to read, exactly as the karyotype
    // and .baja screens do it. A Liverpool design therefore sits beside them in the file
    // browser rather than in a store of its own.
    //
    // The extension names what the file IS, not how it is encoded: .liverpool, JSON inside,
    // for the same reason a .baja screen does not call itself .json.

    const EXT = '.liverpool';
    const TYPE = 'liverpool-neoantigen';
    const VERSION = 1;

    const host = () => (window['env'] && window['env']['apiUrl']) || '';

    // WHAT IS WORTH SAVING is the inputs and the decisions -- the protein sequences, the
    // mutations, the HLA type, which candidates were picked, the construct settings. NOT the
    // scores: those are a pure function of the inputs and of this module's version, and a
    // saved score would go stale silently the first time a motif or a weight is corrected.
    // Reopening a design recomputes, which is the only way the numbers on screen can be
    // trusted to be the numbers this code produces.
    const document_ = (state) => ({
        type: TYPE,
        version: VERSION,
        saved: new Date().toISOString(),
        name: state.name || '',
        patient: {
            label: state.patientLabel || '',
            classI: (state.classI || []).slice(),
            classII: (state.classII || []).slice()
        },
        settings: {
            lengthsI: (state.lengthsI || []).slice(),
            lengthsII: (state.lengthsII || []).slice(),
            linker: state.linker || 'aay',
            leader: state.leader || 'none',
            trailer: state.trailer || 'none',
            utr5: state.utr5 || 'none',
            utr3: state.utr3 || 'none',
            polyA: state.polyA,
            optMode: state.optMode || 'balanced',
            useVaf: state.useVaf !== false,
            useTpm: state.useTpm !== false,
            useAgretopicity: state.useAgretopicity !== false,
            acknowledgedVerify: !!state.acknowledgedVerify
        },
        mutations: (state.mutations || []).map((m) => ({
            id: m.id, gene: m.gene || '', change: m.change || '',
            protein: m.protein || '', neoPeptide: m.neoPeptide || '',
            mutantPeptide: m.mutantPeptide || '', wtPeptide: m.wtPeptide || '',
            vaf: m.vaf, tpm: m.tpm, note: m.note || ''
        })),
        // Selected candidates by peptide, with the order the designer put them in. The
        // peptide is the identity: it survives a change to the scoring, which a row index
        // would not.
        selected: (state.selected || []).slice(),
        proteome: state.proteome ? '(omitted: paste again if needed)' : '',
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
        catch (e) { return { ok: false, message: 'this file is not a Liverpool design (it is not JSON)' }; }
        if (!doc || doc.type !== TYPE) {
            return { ok: false, message: 'this is not a Liverpool design file' + (doc && doc.type ? ' (it says it is a ' + doc.type + ')' : '') };
        }
        if (doc.version > VERSION) {
            return { ok: false, message: 'this design was written by a newer version of the editor (version ' + doc.version + '); this one reads up to ' + VERSION };
        }
        return { ok: true, doc: doc };
    };

    // Flatten a document back into the editor's state shape.
    const toState = (doc) => {
        const s = doc.settings || {}, p = doc.patient || {};
        return {
            name: doc.name || '',
            patientLabel: p.label || '',
            classI: p.classI || [], classII: p.classII || [],
            lengthsI: s.lengthsI && s.lengthsI.length ? s.lengthsI : [8, 9, 10, 11],
            lengthsII: s.lengthsII && s.lengthsII.length ? s.lengthsII : [15],
            linker: s.linker || 'aay', leader: s.leader || 'none', trailer: s.trailer || 'none',
            utr5: s.utr5 || 'none', utr3: s.utr3 || 'none',
            polyA: (typeof s.polyA === 'number') ? s.polyA : 120,
            optMode: s.optMode || 'balanced',
            useVaf: s.useVaf !== false, useTpm: s.useTpm !== false,
            useAgretopicity: s.useAgretopicity !== false,
            acknowledgedVerify: !!s.acknowledgedVerify,
            mutations: doc.mutations || [],
            selected: doc.selected || [],
            notes: doc.notes || '',
            proteome: ''
        };
    };

    return { EXT: EXT, TYPE: TYPE, VERSION: VERSION, save: save, open: open, toState: toState, document: document_ };
}
