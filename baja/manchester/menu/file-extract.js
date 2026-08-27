function (graph, genegraph_panel_layout) {
    // Upload a file (PDF, text, or image), use  to pull out all genetic information
    // (genes / mutations / ASOs), then load the genes, plot the mutations, and zoom-tour each
    // mutation (3s dwell) — all via the shared text-extract processing (presetEntities path).
    return new Promise((resolve) => {
        const guessMime = (name) => {
            const n = ('' + name).toLowerCase();
            if (n.endsWith('.pdf')) return 'application/pdf';
            if (n.endsWith('.png')) return 'image/png';
            if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
            if (n.endsWith('.gif')) return 'image/gif';
            if (n.endsWith('.webp')) return 'image/webp';
            return 'text/plain';
        };
        const hasHits = (e) => e && (((e.genes || []).length) || ((e.mutations || []).length) || ((e.asos || []).length));

        let input = null;
        const cleanup = () => { try { if (input && input.parentNode) input.parentNode.removeChild(input); } catch (e) { } input = null; };

        input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,.txt,.text,.md,.csv,.tsv,application/pdf,text/plain,image/*';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.onchange = async () => {
            const file = input.files && input.files[0];
            if (!file) { cleanup(); resolve(null); return; }

            const MAXB = 9 * 1024 * 1024;   // ~9MB (base64 param stays well under API limits)
            if (file.size > MAXB) {
                graph.setMessage(' File too large (' + Math.round(file.size / 1048576) + 'MB). Max is 9MB. ');
                cleanup(); resolve(null); return;
            }

            const mime = ('' + (file.type || '')).toLowerCase() || guessMime(file.name);
            graph.setMessage(' Reading ' + file.name + ' — finding genes & mutations… ');

            let dataUrl = '';
            try {
                dataUrl = await new Promise((res, rej) => {
                    const fr = new FileReader();
                    fr.onload = () => res(fr.result);
                    fr.onerror = () => rej(fr.error || new Error('read error'));
                    fr.readAsDataURL(file);
                });
            } catch (e) { graph.setMessage(' Could not read the file. '); cleanup(); resolve(null); return; }
            cleanup();

            const comma = ('' + dataUrl).indexOf(',');
            const b64 = comma >= 0 ? ('' + dataUrl).slice(comma + 1) : '';
            if (!b64) { graph.setMessage(' The file was empty. '); resolve(null); return; }

            // Ask  to pull genes / mutations / ASOs out of the file.
            let em = new EngineMonitor(() => { });
            let entities = null;
            try { entities = await exec('/py/sequence/extract-entities-file.py', em, b64, mime, file.name); }
            catch (e) { graph.setMessage(' Extraction failed: ' + (e && e.message ? e.message : e)); resolve(null); return; }

            if (!hasHits(entities)) {
                graph.setMessage(' No genetic information found in ' + file.name
                    + (entities && entities.error ? ' (' + entities.error + ')' : '') + '. ');
                resolve(entities || null); return;
            }

            // Hand the extracted entities to the shared loader/mapper/zoom-tour.
            let r = null;
            try { r = await exec('baja/manchester/menu/text-extract.js', graph, genegraph_panel_layout, null, entities); }
            catch (e) { graph.setMessage(' Mapping failed: ' + (e && e.message ? e.message : e)); }
            resolve(r);
        };

        // If the user dismisses the OS picker, resolve quietly (best-effort; not all browsers fire this).
        input.oncancel = () => { cleanup(); resolve(null); };

        input.click();
    });
}
