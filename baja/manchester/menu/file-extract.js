function (graph, genegraph_panel_layout) {
    // Upload a file (PDF, text, or image), pull out all genetic information (genes /
    // mutations / ASOs), then load the genes, plot the mutations, and zoom-tour each
    // mutation (3s dwell) — all via the shared text-extract processing (presetEntities path).
    // While the file is being read/processed the background is blurred behind a spinner.
    return new Promise((resolve) => {

        graph.setCenterMessage("Uploading...")


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

        // A full-viewport blurred backdrop with a CSS-animated ring. The ring spins via a
        // CSS @keyframe, so it keeps moving regardless of the canvas redraw loop.
        const makeOverlay = (label) => {
            let ov = null, txt = null;
            try {
                if (!document.getElementById('baja-blur-kf')) {
                    const st = document.createElement('style'); st.id = 'baja-blur-kf';
                    st.textContent = '@keyframes bajaBlurSpin{to{transform:rotate(360deg)}}';
                    document.head.appendChild(st);
                }
                ov = document.createElement('div');
                ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;'
                    + 'flex-direction:column;align-items:center;justify-content:center;gap:18px;'
                    + 'background:rgba(10,16,30,0.30);backdrop-filter:blur(7px);'
                    + '-webkit-backdrop-filter:blur(7px);cursor:progress;';
                const ring = document.createElement('div');
                ring.style.cssText = 'width:66px;height:66px;border-radius:50%;'
                    + 'border:6px solid rgba(255,255,255,0.22);border-top-color:#ffd98a;'
                    + 'animation:bajaBlurSpin 0.85s linear infinite;';
                txt = document.createElement('div');
                txt.style.cssText = 'color:#f6ecd8;font:600 15px "Segoe UI",Arial,sans-serif;'
                    + 'text-shadow:0 1px 3px rgba(0,0,0,.6);max-width:80vw;text-align:center;';
                txt.textContent = label || 'Working…';
                ov.appendChild(ring); ov.appendChild(txt);
                // Block interaction with the blurred UI underneath.
                const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
                ov.addEventListener('mousedown', swallow, true);
                ov.addEventListener('click', swallow, true);
                ov.addEventListener('wheel', swallow, { capture: true, passive: false });
                document.body.appendChild(ov);
                try { window.__bajaBlurActive = true; } catch (e) { }   // hide the top work badge while blurred
            } catch (e) { }
            return {
                set: (m) => { try { if (txt) txt.textContent = m; } catch (e) { } },
                remove: () => {
                    try { window.__bajaBlurActive = false; } catch (e) { }
                    try { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); } catch (e) { } ov = null;
                }
            };
        };

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
            const ov = makeOverlay('Reading ' + file.name + '…');

            let dataUrl = '';
            try {
                dataUrl = await new Promise((res, rej) => {
                    const fr = new FileReader();

                    graph.setSunsetMessage(" Uploading...  ")



                    fr.onload = () => res(fr.result);
                    fr.onerror = () => rej(fr.error || new Error('read error'));
                    fr.readAsDataURL(file);
                });
            } catch (e) { ov.remove(); graph.setMessage(' Could not read the file. '); cleanup(); resolve(null); return; }
            cleanup();

            const comma = ('' + dataUrl).indexOf(',');
            const b64 = comma >= 0 ? ('' + dataUrl).slice(comma + 1) : '';
            if (!b64) { ov.remove(); graph.setMessage(' The file was empty. '); resolve(null); return; }

            // Pull genes / mutations / ASOs out of the file.
            ov.set('Finding genes & mutations in ' + file.name + '…');
            let em = new EngineMonitor(() => { });
            let entities = null;
            try { entities = await exec('/py/sequence/extract-entities-file.py', em, b64, mime, file.name); }
            catch (e) { ov.remove(); graph.setMessage(' Extraction failed: ' + (e && e.message ? e.message : e)); resolve(null); return; }

            if (!hasHits(entities)) {
                ov.remove();
                graph.setMessage(' No genetic information found in ' + file.name
                    + (entities && entities.error ? ' (' + entities.error + ')' : '') + '. ');
                resolve(entities || null); return;
            }

            // Extraction done — drop the blur so the tracks load and zoom-tour in full view.
            ov.remove();

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
