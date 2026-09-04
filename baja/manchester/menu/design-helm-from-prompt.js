function (helm, prompt, monomers, sequence, properties) {
    // Bridge for the HELM editor's "Design" button (and baja/manchester/menu/annotation/
    // modify-chemistry.js's prompt window). Sends the current HELM string, the available
    // monomers, the user's natural-language prompt, and (optionally) the oligo's raw base
    // sequence to the Anthropic-backed python script, and resolves with the modified HELM.
    // Runs in the lionscript global scope (so EngineMonitor / env / exec are available);
    // the medchem iframe calls it via window.parent.exec(...).
    return new Promise(async (resolve) => {
        try {
            const server = (window['env'] && window['env']['apiUrl']) || '';
            const PY = server + '/py/sequence/design-helm-chemistry.py';
            // Drop molfiles before this goes anywhere. design-helm-chemistry.py reads only
            // symbol/name/polymerType/monomerType/naturalAnalog, but the full library carries
            // a molfile per monomer -- 1.0 MB of the 1.5 MB total -- and sending it failed
            // with the request being too long. Slimming here covers every caller, including
            // ones that hand over the whole of baja/chem/monomers.js.
            const slimMonomers = (ms) => {
                try {
                    const a = (ms && ms.monomers) ? ms.monomers : ms;
                    if (!Array.isArray(a)) return ms || [];
                    return a.filter((m) => m && m.symbol).map((m) => ({
                        symbol: m.symbol, name: m.name, polymerType: m.polymerType,
                        monomerType: m.monomerType, naturalAnalog: m.naturalAnalog
                    }));
                } catch (e) { return ms || []; }
            };
            const monomersStr = (typeof monomers === 'string') ? monomers : JSON.stringify(slimMonomers(monomers));
            const propsStr = (typeof properties === 'string') ? properties : JSON.stringify(properties || {});
            let em = new EngineMonitor((m) => { try { log(m); } catch (e) { } });
            const res = await exec(PY, em, helm || '', prompt || '', monomersStr, sequence || '', propsStr);
            resolve(res || { error: 'no result' });
        } catch (e) {
            resolve({ error: String(e) });
        }
    });
}
