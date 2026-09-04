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
            const monomersStr = (typeof monomers === 'string') ? monomers : JSON.stringify(monomers || []);
            const propsStr = (typeof properties === 'string') ? properties : JSON.stringify(properties || {});
            let em = new EngineMonitor((m) => { try { log(m); } catch (e) { } });
            const res = await exec(PY, em, helm || '', prompt || '', monomersStr, sequence || '', propsStr);
            resolve(res || { error: 'no result' });
        } catch (e) {
            resolve({ error: String(e) });
        }
    });
}
