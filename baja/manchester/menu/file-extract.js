function (graph, genegraph_panel_layout) {
    // Upload a file (PDF, text, or image) and pull out all genetic information (genes /
    // mutations / ASOs). This runs in the BACKGROUND: the app stays fully interactive while
    // a small spinning notice in the UPPER-LEFT corner shows the job is still running. When
    // the extraction finishes, the app PROMPTS the user to ask whether to load the results
    // into the workbench (via the shared text-extract loader/mapper/zoom-tour).
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
        const summarize = (e) => {
            const ng = (e.genes || []).length, nm = (e.mutations || []).length, na = (e.asos || []).length;
            const parts = [];
            if (ng) parts.push(ng + ' gene' + (ng === 1 ? '' : 's'));
            if (nm) parts.push(nm + ' mutation' + (nm === 1 ? '' : 's'));
            if (na) parts.push(na + ' ASO' + (na === 1 ? '' : 's'));
            return parts.join(', ') || 'results';
        };

        // A small, NON-BLOCKING spinning notice pinned to the upper-left of the window. The
        // ring spins via a CSS @keyframe (independent of the canvas redraw loop). pointer-events
        // are off so it never blocks interaction with the workbench underneath.
        const makeNotice = (label) => {
            let box = null, ring = null, txt = null;
            try {
                if (!document.getElementById('baja-blur-kf')) {
                    const st = document.createElement('style'); st.id = 'baja-blur-kf';
                    st.textContent = '@keyframes bajaBlurSpin{to{transform:rotate(360deg)}}';
                    document.head.appendChild(st);
                }
                box = document.createElement('div');
                box.style.cssText = 'position:fixed;top:104px;left:14px;z-index:2147483000;'
                    + 'display:flex;align-items:center;gap:10px;padding:9px 14px 9px 11px;'
                    + 'border-radius:12px;background:rgba(10,25,40,0.88);'
                    + 'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);'
                    + 'box-shadow:0 8px 24px rgba(0,0,0,0.42);border:1px solid rgba(18,194,224,0.35);'
                    + 'font:600 13px "Segoe UI",Arial,sans-serif;color:#eaf6f9;max-width:46vw;'
                    + 'pointer-events:none;';
                ring = document.createElement('div');
                ring.style.cssText = 'flex:0 0 auto;width:18px;height:18px;border-radius:50%;'
                    + 'border:3px solid rgba(255,255,255,0.22);border-top-color:#ffd98a;'
                    + 'animation:bajaBlurSpin 0.8s linear infinite;';
                txt = document.createElement('div');
                txt.textContent = label || 'Working…';
                box.appendChild(ring); box.appendChild(txt);
                document.body.appendChild(box);
                // Sit the notice directly UNDER the top row of round buttons (the 'button-canvas'
                // toolbar) rather than overlapping it. Measure the lowest button row near the top of
                // the window and drop the notice just below it; fall back to the fixed top otherwise.
                try {
                    let lowest = 0;
                    const bcs = document.querySelectorAll('button-canvas');
                    for (const bc of bcs) {
                        const r = bc.getBoundingClientRect();
                        if (r.top < 160 && r.width > 40 && r.height > 8 && r.bottom > lowest) lowest = r.bottom;
                    }
                    if (lowest > 0) box.style.top = Math.round(lowest + 10) + 'px';
                } catch (e) { }
            } catch (e) { }
            return {
                set: (m) => { try { if (txt) txt.textContent = m; } catch (e) { } },
                // Stop the spin and recolor the ring into a static dot to signal a final state.
                stop: (color) => { try { if (ring) { ring.style.animation = 'none'; ring.style.border = '3px solid ' + (color || '#16c47f'); } } catch (e) { } },
                remove: () => { try { if (box && box.parentNode) box.parentNode.removeChild(box); } catch (e) { } box = null; }
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

            // Start the upper-left background notice, then release the menu immediately so the
            // app stays interactive while the file uploads and is analyzed.
            const notice = makeNotice('Uploading ' + file.name + '…');
            graph.setMessage(' Uploading ' + file.name + ' — extracting in the background… ');
            cleanup();
            resolve(null);   // <- background mode: the launcher menu closes, the work continues below

            // ---- Background work (not awaited by the caller) --------------------------------
            let dataUrl = '';
            try {
                dataUrl = await new Promise((res, rej) => {
                    const fr = new FileReader();
                    fr.onload = () => res(fr.result);
                    fr.onerror = () => rej(fr.error || new Error('read error'));
                    fr.readAsDataURL(file);
                });
            } catch (e) {
                notice.set('Could not read ' + file.name); notice.stop('#c0455a');
                setTimeout(() => notice.remove(), 4000);
                return;
            }

            const comma = ('' + dataUrl).indexOf(',');
            const b64 = comma >= 0 ? ('' + dataUrl).slice(comma + 1) : '';
            if (!b64) {
                notice.set(file.name + ' was empty'); notice.stop('#c0455a');
                setTimeout(() => notice.remove(), 4000);
                return;
            }

            // Progress copy: "Analyzing" once the upload has likely landed (~4s), and the
            // 2-minute ceiling note if it's still going at 20s.
            notice.set('Analyzing ' + file.name + ' in the background…');
            const em = new EngineMonitor(() => { });
            const t1 = setTimeout(() => { try { notice.set('Analyzing ' + file.name + '… still working'); } catch (e) { } }, 4000);
            const slow = setTimeout(() => { try { notice.set('Analyzing ' + file.name + '… this can take up to 2 minutes'); } catch (e) { } }, 20000);
            // Hard 3-minute cap: if the job runs longer, treat the service as overloaded, stop
            // waiting on it and drop the notice. exec() has no client-side abort hook, but the
            // extractor's own Claude request is bounded to ~3 minutes server-side (requests
            // timeout=180), so the underlying Claude job is dropped around the same moment.
            const TIMEOUT_MS = 3 * 60 * 1000;
            let timedOut = false, toTimer = null;
            const timeoutP = new Promise((res) => { toTimer = setTimeout(() => { timedOut = true; res(null); }, TIMEOUT_MS); });
            const clearTimers = () => {
                try { clearTimeout(t1); } catch (e) { }
                try { clearTimeout(slow); } catch (e) { }
                try { clearTimeout(toTimer); } catch (e) { }
            };

            let entities = null;
            try { entities = await Promise.race([exec('/py/sequence/extract-entities-file.py', em, b64, mime, file.name), timeoutP]); }
            catch (e) {
                clearTimers();
                notice.set('Extraction failed: ' + (e && e.message ? e.message : e)); notice.stop('#c0455a');
                setTimeout(() => notice.remove(), 6000);
                return;
            }
            clearTimers();

            // Over 3 minutes -> service overloaded; abandon the job (any late result is ignored).
            if (timedOut) {
                notice.set('Service overloaded — please try again later'); notice.stop('#c0455a');
                graph.setMessage(' The extraction service is overloaded. Please try again later. ');
                setTimeout(() => notice.remove(), 8000);
                return;
            }

            if (!hasHits(entities)) {
                notice.set('No genetic information found in ' + file.name); notice.stop('#c0455a');
                graph.setMessage(' No genetic information found in ' + file.name
                    + (entities && entities.error ? ' (' + entities.error + ')' : '') + '. ');
                setTimeout(() => notice.remove(), 6000);
                return;
            }

            // ---- Done: prompt the user before loading anything into the workbench ----------
            const summary = summarize(entities);
            notice.set('✓ Found ' + summary + ' in ' + file.name); notice.stop('#16c47f');
            graph.setMessage(' Extraction complete — ' + summary + ' found in ' + file.name + '. ');

            const doLoad = async () => {
                try { if (graph.hideMenu) graph.hideMenu(); } catch (e) { }
                notice.set('Loading ' + summary + ' into the workbench…');
                try { await exec('baja/manchester/menu/text-extract.js', graph, genegraph_panel_layout, null, entities); }
                catch (e) { graph.setMessage(' Mapping failed: ' + (e && e.message ? e.message : e)); }
                notice.remove();
            };
            const dismiss = () => {
                try { if (graph.hideMenu) graph.hideMenu(); } catch (e) { }
                notice.remove();
                graph.setMessage(' Results from ' + file.name + ' were not loaded. ');
            };

            try {
                graph.showMenu([
                    { label: 'Load ' + summary + ' into the workbench', move: () => { }, click: () => { doLoad(); } },
                ]);
            } catch (e) {
                // If no menu is available, fall back to auto-loading so the work isn't lost.
                doLoad();
            }
        };

        // If the user dismisses the OS picker, resolve quietly (best-effort; not all browsers fire this).
        input.oncancel = () => { cleanup(); resolve(null); };

        input.click();
    });
}
