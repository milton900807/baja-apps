function (graph, genegraph_panel_layout) {
    // Paste-an-image → tracks. Sets up a ONE-TIME document paste listener: when the user pastes
    // an image from the clipboard (e.g. a screenshot of a genetics table/figure), the image is
    // sent through the SAME extractor the file uploader uses (extract-entities-file.py), then the
    // user is prompted to load the found genes / mutations / ASOs into the workbench as tracks
    // with annotated mutations (via the shared text-extract loader/mapper).
    try {
        if (window.__bajaPasteImageInit) return;
        window.__bajaPasteImageInit = true;
    } catch (e) { return; }

    // Small non-blocking spinning notice pinned to the upper-left (same style as file-extract).
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
            stop: (color) => { try { if (ring) { ring.style.animation = 'none'; ring.style.border = '3px solid ' + (color || '#16c47f'); } } catch (e) { } },
            remove: () => { try { if (box && box.parentNode) box.parentNode.removeChild(box); } catch (e) { } box = null; }
        };
    };

    const summarize = (e) => {
        const ng = (e.genes || []).length, nm = (e.mutations || []).length, na = (e.asos || []).length;
        const parts = [];
        if (ng) parts.push(ng + ' gene' + (ng === 1 ? '' : 's'));
        if (nm) parts.push(nm + ' mutation' + (nm === 1 ? '' : 's'));
        if (na) parts.push(na + ' ASO' + (na === 1 ? '' : 's'));
        return parts.join(', ') || 'results';
    };
    const hasHits = (e) => e && (((e.genes || []).length) || ((e.mutations || []).length) || ((e.asos || []).length));

    const processImage = async (b64, mime, name) => {
        const notice = makeNotice('Analyzing pasted image…');
        try { graph.setMessage(' Analyzing pasted image — extracting genes & mutations… '); } catch (e) { }

        const TIMEOUT_MS = 3 * 60 * 1000;
        let timedOut = false, toTimer = null;
        const timeoutP = new Promise((res) => { toTimer = setTimeout(() => { timedOut = true; res(null); }, TIMEOUT_MS); });
        let entities = null;
        try {
            const em = new EngineMonitor(() => { });
            entities = await Promise.race([exec('/py/sequence/extract-entities-file.py', em, b64, mime, name || 'pasted-image.png'), timeoutP]);
        } catch (e) {
            try { clearTimeout(toTimer); } catch (e2) { }
            notice.set('Extraction failed: ' + (e && e.message ? e.message : e)); notice.stop('#c0455a');
            setTimeout(() => notice.remove(), 6000);
            return;
        }
        try { clearTimeout(toTimer); } catch (e) { }

        if (timedOut) {
            notice.set('Service overloaded — please try again later'); notice.stop('#c0455a');
            setTimeout(() => notice.remove(), 8000);
            return;
        }
        if (!hasHits(entities)) {
            notice.set('No genetic information found in the pasted image'); notice.stop('#c0455a');
            setTimeout(() => notice.remove(), 6000);
            return;
        }

        const summary = summarize(entities);
        notice.set('✓ Found ' + summary + ' in the image'); notice.stop('#16c47f');
        try { graph.setMessage(' Extraction complete — ' + summary + ' found in the pasted image. '); } catch (e) { }

        const doLoad = async () => {
            try { if (graph.hideMenu) graph.hideMenu(); } catch (e) { }
            notice.set('Loading ' + summary + ' into the workbench…');
            try { await exec('baja/manchester/menu/text-extract.js', graph, genegraph_panel_layout, null, entities); }
            catch (e) { try { graph.setMessage(' Mapping failed: ' + (e && e.message ? e.message : e)); } catch (e2) { } }
            notice.remove();
        };

        try {
            graph.showMenu([
                { label: 'Load ' + summary + ' into the workbench', move: () => { }, click: () => { doLoad(); } },
            ]);
        } catch (e) {
            doLoad();
        }
    };

    // Grab the first image on the clipboard when the user pastes; ignore non-image pastes so
    // normal text paste still works.
    document.addEventListener('paste', async (evt) => {
        try {
            const items = (evt.clipboardData && evt.clipboardData.items) || [];
            let blob = null;
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                if (it && it.type && ('' + it.type).indexOf('image') === 0) { blob = it.getAsFile(); break; }
            }
            if (!blob) return;   // no image → let the normal paste happen
            evt.preventDefault();
            const dataUrl = await new Promise((res, rej) => {
                const fr = new FileReader();
                fr.onload = () => res(fr.result);
                fr.onerror = () => rej(fr.error || new Error('read error'));
                fr.readAsDataURL(blob);
            });
            const s = '' + dataUrl;
            const comma = s.indexOf(',');
            const b64 = comma >= 0 ? s.slice(comma + 1) : '';
            const mime = blob.type || 'image/png';
            if (b64) processImage(b64, mime, (blob.name || 'pasted-image.png'));
        } catch (e) { }
    });
}
