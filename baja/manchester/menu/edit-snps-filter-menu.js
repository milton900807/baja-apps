function (graph, genegraph_panel_layout, selectedTrack, range) {
    // A series of cascading center-menus for filtering a track's SNPs by attribute.
    // Filters are additive (AND) and non-destructive (toggle each SNP's `hidden` flag,
    // which getVisibleSNPs respects). State persists on the track so re-opening keeps it.
    // `range` (optional {lo, hi} in world/genomic coords) scopes the filter to a lasso/box
    // selection: only SNPs inside it are considered, and everything outside is hidden.
    const track = selectedTrack;
    const snps = (track && track.snpindels) || [];
    if (!snps.length) { graph.setMessage(' This track has no SNPs to filter. '); return; }

    const inRange = (s) => !range || (s.xi >= range.lo && s.xi <= range.hi);
    // The working set the menus tally + report against (the selection, or the whole track).
    const pool = range ? snps.filter(inRange) : snps;
    if (range && !pool.length) { graph.setMessage(' No SNPs in the selected region. '); return; }
    const M = pool.length;

    // FEEDBACK WHILE IT WORKS. (Helpers are prefixed __vf_: this body runs after lib/core.js in one
    // function, and core.js already declares names such as `status`.) A track can carry tens of thousands of variants (ClinVar, gnomAD),
    // and tallying, filtering or removing them runs on the main thread: the canvas stops and
    // nothing said why. Every step now puts what it is doing in the status line (spinner) and the
    // message bar FIRST, lets the browser paint that, works in chunks with a running count, and
    // clears the status when it is done.
    const __vf_tname = (track && track.name) || 'track';
    const __vf_fmt = (n) => (+n || 0).toLocaleString();
    // Three places, because none of them alone is guaranteed to show: the shell's status line
    // (only where the shell provides it), the canvas message bar (drawn on the canvas's next frame,
    // so the canvas is woken), and a small panel of our own at the top of the window, which is
    // plain DOM and paints whatever the canvas is doing.
    const __vf_panel = () => {
        let el = document.getElementById('baja-variants-progress');
        if (!el) {
            el = document.createElement('div');
            el.id = 'baja-variants-progress';
            el.setAttribute('role', 'status');
            el.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483000;'
                + 'display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:10px;'
                + 'background:rgba(10,37,64,0.96);border:1px solid #1aa3bd;color:#eaf6f9;'
                + 'font:13px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 10px 28px rgba(10,37,64,0.35);pointer-events:none;white-space:nowrap;';
            el.innerHTML = '<span style="width:14px;height:14px;border:2px solid rgba(26,163,189,0.35);border-top-color:#1aa3bd;border-radius:50%;display:inline-block;animation:bajaVarSpin 0.8s linear infinite;"></span><span class="t"></span>';
            if (!document.getElementById('baja-variants-progress-kf')) {
                const st = document.createElement('style');
                st.id = 'baja-variants-progress-kf';
                st.textContent = '@keyframes bajaVarSpin{to{transform:rotate(360deg)}}';
                document.head.appendChild(st);
            }
            document.body.appendChild(el);
        }
        return el;
    };
    const __vf_status = (text) => {
        try { exec('baja/lib/work-status.js', 'Variants · ' + text); } catch (e) { }
        try { graph.setMessage(' ' + text + ' '); if (graph.wake) graph.wake(); } catch (e) { }
        try { __vf_panel().querySelector('.t').textContent = text; } catch (e) { }
    };
    const __vf_done = () => {
        try { exec('baja/lib/work-status.js', null); } catch (e) { }
        try { const el = document.getElementById('baja-variants-progress'); if (el) el.remove(); } catch (e) { }
        try { if (graph.wake) graph.wake(); } catch (e) { }
    };
    // Yield until the browser has painted, so the status above is on screen before the work starts.
    const __vf_tick = () => new Promise((r) => {
        try { if (window.requestAnimationFrame) return requestAnimationFrame(() => setTimeout(r, 0)); } catch (e) { }
        setTimeout(r, 16);
    });
    const __vf_busy = async (text, fn) => { __vf_status(text); await __vf_tick(); try { return await fn(); } finally { __vf_done(); } };
    const __vf_CHUNK = 4000;

    // gnomAD LOOKUP for the variants on this track: their global (species-wide) allele
    // frequency. Asks the server's /variants/region (db=gnomad, which calls the gnomAD v4 API) in
    // windows of at most 30 kb around clusters of variants, matches each variant by position, ref
    // and alt, and records s.gnomadAf: the frequency, or 0 when the window was read and the allele
    // is not in it. A window that comes back empty is treated as NOT LOOKED UP rather than
    // "absent" -- gnomAD has variants nearly everywhere, and the server returns an empty list when
    // the API call fails. Reports progress window by window.
    const __vf_gnomad = async (list) => {
        const out = { ok: false, found: 0, absent: 0, unknown: 0, why: '' };
        const chr = ('' + (track.chr || '')).replace(/^chr/i, '');
        if (!chr) { out.why = 'the track has no chromosome'; return out; }
        const species = ('' + (track.species || 'human')).toLowerCase();
        const server = (window['env'] && window['env']['apiUrl']) || window.location.origin;
        const child = !!(track.isChildCDNATrack && track.isChildCDNATrack());
        const gpos = (s) => {
            try { const g = child ? track.genomicAt(Math.round(+s.xi)) : Math.round(+s.xi); return (g != null && isFinite(g)) ? +g : null; } catch (e) { return null; }
        };
        const items = [];
        for (const s of list) { s.gnomadAf = null; const g = gpos(s); if (g != null) items.push({ s, g }); else out.unknown++; }
        if (!items.length) { out.why = 'no genomic positions'; return out; }
        items.sort((a, b) => a.g - b.g);
        const wins = [];
        for (const it of items) {
            const w = wins[wins.length - 1];
            if (w && it.g - w.hi <= 5000 && it.g - w.lo <= 30000) { w.hi = it.g; w.items.push(it); }
            else wins.push({ lo: it.g, hi: it.g, items: [it] });
        }
        const comp = { A: 'T', C: 'G', G: 'C', T: 'A' };
        const rc = (x) => ('' + x).toUpperCase().split('').reverse().map((c) => comp[c] || c).join('');
        let okWins = 0;
        for (let i = 0; i < wins.length; i++) {
            const w = wins[i];
            __vf_status('Looking up global frequencies in gnomAD · region ' + (i + 1) + ' / ' + wins.length + ' (chr' + chr + ':' + __vf_fmt(w.lo) + ')…');
            await __vf_tick();
            let vs = null;
            try {
                const url = server + '/variants/region?species=' + encodeURIComponent(species) + '&region=' + encodeURIComponent(chr + ':' + (w.lo - 2) + '-' + (w.hi + 2)) + '&db=gnomad&limit=60000';
                const r = await fetch(url);
                const j = r.ok ? await r.json() : null;
                vs = (j && Array.isArray(j.variants)) ? j.variants : null;
                if (j && j.error) out.why = j.error;
            } catch (e) { vs = null; out.why = '' + (e && e.message || e); }
            if (!vs || !vs.length) { out.unknown += w.items.length; continue; }
            okWins++;
            const byPos = new Map();
            for (const v of vs) { const k = +v.start; if (!byPos.has(k)) byPos.set(k, []); byPos.get(k).push(v); }
            for (const { s, g } of w.items) {
                const ref = ('' + (s.reference ?? '')).toUpperCase(), alt = ('' + (s.alternate ?? '')).toUpperCase();
                let hit = null;
                // the variant's own position, and one before it (a VCF-style deletion is drawn past
                // its anchor base); the alleles as given, or reverse-complemented if stored on the
                // transcript strand
                const isDel = ('' + s.type).toLowerCase() === 'del' || ref.length > alt.length;
                for (const p of (isDel ? [g, g - 1] : [g])) {
                    for (const v of (byPos.get(p) || [])) {
                        const vr = ('' + v.ref).toUpperCase(), va = ('' + v.alt).toUpperCase();
                        if ((vr === ref && va === alt) || (vr === rc(ref) && va === rc(alt))) { hit = v; break; }
                    }
                    if (hit) break;
                }
                s.gnomadAf = hit ? (hit.af != null ? +hit.af : 0) : 0;
                s.gnomadId = hit ? hit.id : null;
                if (hit && hit.af != null) { out.found++; if (s.af == null) s.af = +hit.af; } else out.absent++;
            }
        }
        __vf_done();
        out.ok = okWins > 0;
        if (!out.ok && !out.why) out.why = 'no data returned';
        return out;
    };

    return (async () => {
    __vf_status('Reading ' + __vf_fmt(M) + ' variants on ' + __vf_tname + '…');
    await __vf_tick();
    try {

    const F = track.__snpFilter || (track.__snpFilter = { type: null, source: null, clinsig: null, clinGroup: null, consequence: null, quality: null, phase: null, minAf: null });

    const readAf = (s) => {
        if (s.af != null && isFinite(s.af)) return +s.af;
        const m = ('' + (s.quality || '')).match(/AF=([0-9.eE+-]+)/);
        return m ? parseFloat(m[1]) : null;
    };
    // Distinct TERMS present on the track for a multi-valued attribute. Values are often
    // multi-term (e.g. ClinVar "Pathogenic/Likely_pathogenic", or a comma-joined source /
    // consequence), so split on comma/slash/pipe/semicolon and normalize — each distinct
    // term becomes its own filter option.
    const termsOf = (val) => {
        const c = ('' + (val == null ? '' : val)).trim();
        if (!c) return [];
        return c.split(/[,/|;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
    };
    const clinTermsOf = (s) => termsOf(s.clinsig);
    const srcTermsOf = (s) => termsOf(s.source);
    const consTermsOf = (s) => termsOf(s.structure || s.consequence);
    // Single-value attributes (exact match). null/'' -> not present.
    const qualOf = (s) => (s.quality != null && s.quality !== '') ? ('' + s.quality) : null;
    const phaseOf = (s) => (s.phase != null && s.phase !== '') ? ('' + s.phase) : null;

    // Clinical-relevance GROUPS: collapse the many exact ClinVar terms into the buckets a
    // clinician usually wants. Word-boundary regex so "pathogenic" also matches "likely
    // pathogenic" but NOT "pathogenicity" (as in "conflicting … of pathogenicity").
    const CLIN_GROUPS = {
        pathogenic: { label: 'Pathogenic (incl. likely)', re: /\bpathogenic\b/ },
        benign: { label: 'Benign (incl. likely)', re: /\bbenign\b/ },
        uncertain: { label: 'Uncertain significance (VUS)', re: /\buncertain\b/ },
        conflicting: { label: 'Conflicting interpretations', re: /conflict/ },
        risk: { label: 'Risk factor', re: /risk/ },
        drug: { label: 'Drug response', re: /drug/ },
        protective: { label: 'Protective', re: /protective/ },
    };
    const inClinGroup = (s, key) => {
        if (key === 'hasclin') return clinTermsOf(s).length > 0;
        const g = CLIN_GROUPS[key];
        return !!g && clinTermsOf(s).some((t) => g.re.test(t));
    };

    const matches = (s) => {
        if (!inRange(s)) return false;   // scoped to the lasso/box selection when `range` is set
        if (F.type && ('' + s.type).toLowerCase() !== F.type) return false;
        if (F.source && srcTermsOf(s).indexOf(F.source) < 0) return false;
        if (F.clinsig && clinTermsOf(s).indexOf(F.clinsig) < 0) return false;
        if (F.clinGroup && !inClinGroup(s, F.clinGroup)) return false;
        if (F.consequence && consTermsOf(s).indexOf(F.consequence) < 0) return false;
        if (F.quality != null && qualOf(s) !== F.quality) return false;
        if (F.phase != null && phaseOf(s) !== F.phase) return false;
        if (F.minAf != null) { const af = readAf(s); if (af == null || af < F.minAf) return false; }
        return true;
    };
    const apply = async (what) => {
        const N = snps.length;
        __vf_status((what || 'Filtering') + ' · ' + __vf_fmt(N) + ' variants on ' + __vf_tname + '…');
        await __vf_tick();
        let shown = 0;
        try {
            for (let i = 0; i < N; i++) {
                const s = snps[i];
                s.hidden = !matches(s);
                if (!s.hidden) shown++;
                if (i && i % __vf_CHUNK === 0) {
                    __vf_status((what || 'Filtering') + ' · ' + __vf_fmt(i) + ' / ' + __vf_fmt(N) + ' variants on ' + __vf_tname + '…');
                    await __vf_tick();
                }
            }
            track.showSnpIndels = true;
            if (graph.wake) graph.wake();
        } finally { __vf_done(); }
        return shown;
    };

    const tally = (fn) => { const m = {}; for (const s of pool) { const ks = fn(s); (Array.isArray(ks) ? ks : [ks]).forEach((k) => { if (k == null || k === '') return; m[k] = (m[k] || 0) + 1; }); } return m; };
    const typeT = tally((s) => ('' + s.type).toLowerCase());
    const srcT = tally((s) => srcTermsOf(s));
    const clinT = tally((s) => clinTermsOf(s));
    const consT = tally((s) => consTermsOf(s));
    const qualT = tally((s) => qualOf(s));
    const phaseT = tally((s) => phaseOf(s));
    const hasAf = pool.some((s) => readAf(s) != null);
    const nKeys = (o) => Object.keys(o).length;

    const activeLabel = () => {
        const p = [];
        if (F.type) p.push('type=' + F.type);
        if (F.source) p.push('src=' + F.source);
        if (F.clinsig) p.push('clin=' + F.clinsig);
        if (F.clinGroup) p.push('clin~' + F.clinGroup);
        if (F.consequence) p.push('cons=' + F.consequence);
        if (F.quality != null) p.push('qual=' + F.quality);
        if (F.phase != null) p.push('phase=' + F.phase);
        if (F.minAf != null) p.push('AF≥' + F.minAf);
        return p.length ? p.join('  ') : '(none)';
    };

    // Clinical significance submenu: the grouped presets that actually match the data
    // (pathogenic incl. likely, benign, VUS…) AND the DISTINCT clinsig values present on
    // the track, each with counts. Either narrows the current view.
    const clinGroupMenu = () => {
        const items = [
            { label: '‹ back', move: () => { }, click: () => mainMenu() },
            { label: 'Any / clear', move: () => { }, click: async () => { F.clinGroup = null; F.clinsig = null; const n = await apply(); graph.setMessage(' Clinical filter cleared — ' + n + ' shown. '); mainMenu(); } },
        ];
        // Grouped presets (only those with matches).
        const addGroup = (key, label) => {
            const cnt = pool.filter((s) => inClinGroup(s, key)).length;
            if (!cnt) return;
            items.push({
                label: (F.clinGroup === key ? '✓ ' : '') + label + '  (' + cnt + ')', move: () => { },
                click: async () => { F.clinGroup = key; F.clinsig = null; const n = await apply(); graph.setMessage(' ' + label + ' — ' + n + ' of ' + M + ' shown. '); mainMenu(); }
            });
        };
        addGroup('hasclin', 'Any clinical significance');
        Object.keys(CLIN_GROUPS).forEach((k) => addGroup(k, CLIN_GROUPS[k].label));

        // Distinct clinsig values on the track (the reliable, data-driven options).
        const keys = Object.keys(clinT).sort((a, b) => clinT[b] - clinT[a]);
        if (keys.length) items.push({ label: '── exact values ──', move: () => { }, click: () => clinGroupMenu() });
        keys.forEach((k) => {
            items.push({
                label: (F.clinsig === k ? '✓ ' : '') + k + '  (' + clinT[k] + ')', move: () => { },
                click: async () => { F.clinsig = k; F.clinGroup = null; const n = await apply(); graph.setMessage(' clinsig = ' + k + ' — ' + n + ' of ' + M + ' shown. '); mainMenu(); }
            });
        });
        if (keys.length === 0 && items.length <= 2) {
            items.push({ label: '(no clinical-significance data on this track)', move: () => { }, click: () => clinGroupMenu() });
        }
        graph.showMenu(items);
    };

    // A value-picker submenu for one attribute.
    const valueMenu = (title, tallyObj, current, setFn) => {
        const items = [
            { label: '‹ back', move: () => { }, click: () => mainMenu() },
            {
                label: 'Any / clear', move: () => { }, click: async () => {
                    setFn(null); const n = await apply();
                    graph.setMessage(' ' + title + ' filter cleared — ' + n + ' of ' + M + ' shown. ');
                    mainMenu();
                }
            },
        ];
        Object.keys(tallyObj).sort((a, b) => tallyObj[b] - tallyObj[a]).forEach((k) => {
            items.push({
                label: (current === k ? '✓ ' : '') + k + '  (' + tallyObj[k] + ')', move: () => { }, click: async () => {
                    setFn(k); const n = await apply();
                    graph.setMessage(' ' + title + ' = ' + k + ' — ' + n + ' of ' + M + ' shown. ');
                    mainMenu();
                }
            });
        });
        graph.showMenu(items);
    };

    const afMenu = () => {
        const items = [
            { label: '‹ back', move: () => { }, click: () => mainMenu() },
            { label: 'Any / clear', move: () => { }, click: async () => { F.minAf = null; const n = await apply(); graph.setMessage(' AF filter cleared — ' + n + ' shown. '); mainMenu(); } },
        ];
        [0.10, 0.05, 0.01, 0.001].forEach((th) => {
            items.push({
                label: (F.minAf === th ? '✓ ' : '') + 'AF ≥ ' + th, move: () => { }, click: async () => {
                    F.minAf = th; const n = await apply();
                    graph.setMessage(' AF ≥ ' + th + ' — ' + n + ' of ' + M + ' shown. ');
                    mainMenu();
                }
            });
        });
        graph.showMenu(items);
    };

    const mainMenu = () => {
        // Data-driven: only offer an attribute when the SNPs actually carry values for it
        // (e.g. quality/phase appear only when not all null).
        const items = [
            { label: '── scope: ' + (range ? 'selection (' + M + ' SNPs)' : 'whole track (' + M + ' SNPs)'), move: () => { }, click: () => mainMenu() },
        ];
        if (nKeys(typeT)) items.push({ label: 'Type ▸  (' + nKeys(typeT) + ')', move: () => { }, click: () => valueMenu('Type', typeT, F.type, (v) => { F.type = v; }) });
        if (nKeys(clinT)) items.push({ label: 'Clinical significance ▸  (' + nKeys(clinT) + ' values)', move: () => { }, click: () => clinGroupMenu() });
        if (nKeys(qualT)) items.push({ label: 'Quality ▸  (' + nKeys(qualT) + ')', move: () => { }, click: () => valueMenu('Quality', qualT, F.quality, (v) => { F.quality = v; }) });
        if (nKeys(phaseT)) items.push({ label: 'Phase ▸  (' + nKeys(phaseT) + ')', move: () => { }, click: () => valueMenu('Phase', phaseT, F.phase, (v) => { F.phase = v; }) });
        if (nKeys(srcT)) items.push({ label: 'Source ▸  (' + nKeys(srcT) + ')', move: () => { }, click: () => valueMenu('Source', srcT, F.source, (v) => { F.source = v; }) });
        if (nKeys(consT)) items.push({ label: 'Consequence ▸  (' + nKeys(consT) + ')', move: () => { }, click: () => valueMenu('Consequence', consT, F.consequence, (v) => { F.consequence = v; }) });
        if (hasAf) items.push({ label: 'Allele frequency ▸', move: () => { }, click: () => afMenu() });
        items.push({ label: '─ active: ' + activeLabel(), move: () => { }, click: () => mainMenu() });
        items.push(
            {
                label: 'Show all (clear filters)', move: () => { }, click: async () => {
                    F.type = F.source = F.clinsig = F.clinGroup = F.consequence = F.quality = F.phase = null; F.minAf = null;
                    await apply('Clearing filters');
                    graph.setMessage(' Filters cleared — showing all ' + M + ' SNPs. ');
                    mainMenu();
                }
            },
            {
                label: 'Remove hidden', move: () => { }, click: async () => {
                    const hiddenCount = track.snpindels.filter((s) => s.hidden).length;
                    if (!hiddenCount) { graph.setMessage(' No hidden SNPs to remove. '); return; }
                    const doRemove = () => __vf_busy('Removing variants from ' + __vf_tname + '…', () => {
                        const before = track.snpindels.length;
                        track.snpindels = track.snpindels.filter((s) => !s.hidden);
                        const rm = before - track.snpindels.length;
                        let childRm = 0;
                        try { if (track.clearDescendantSnps) childRm = track.clearDescendantSnps(graph); } catch (e) { }
                        if (graph.wake) graph.wake();
                        graph.setMessage(' Removed ' + rm + ' hidden SNP' + (rm === 1 ? '' : 's')
                            + (childRm ? ' (+' + childRm + ' from child tracks)' : '') + '; ' + track.snpindels.length + ' remain. ');
                        if (graph.hideMenu) graph.hideMenu();
                    });
                    if (graph.hideMenu) graph.hideMenu();
                    try {
                        const c = await exec('baja/lib/confirm.js', 'Remove ' + hiddenCount + ' hidden (filtered-out) SNP' + (hiddenCount === 1 ? '' : 's') + '? This cannot be undone.', () => { doRemove(); });
                        showModal(c);
                    } catch (e) { doRemove(); }
                }
            },
            {
                // Remove the SNPs that currently MATCH the filter (e.g. filter clinsig =
                // "likely pathogenic" within a selection, then delete just those).
                label: 'Remove shown (matching filter)', move: () => { }, click: async () => {
                    const shown = snps.filter((s) => !s.hidden);
                    if (!shown.length) { graph.setMessage(' No matching SNPs to remove — set a filter first. '); return; }
                    const what = activeLabel() === '(none)' ? (range ? 'in selection' : 'on track') : activeLabel();
                    const doRemove = () => __vf_busy('Removing variants from ' + __vf_tname + '…', () => {
                        const before = track.snpindels.length;
                        track.snpindels = track.snpindels.filter((s) => s.hidden);   // keep hidden, drop the matching
                        const rm = before - track.snpindels.length;
                        let childRm = 0;
                        try { if (track.clearDescendantSnps) childRm = track.clearDescendantSnps(graph); } catch (e) { }
                        if (graph.wake) graph.wake();
                        graph.setMessage(' Removed ' + rm + ' matching SNP' + (rm === 1 ? '' : 's')
                            + (childRm ? ' (+' + childRm + ' from child tracks)' : '') + '; ' + track.snpindels.length + ' remain. ');
                        if (graph.hideMenu) graph.hideMenu();
                    });
                    if (graph.hideMenu) graph.hideMenu();
                    try {
                        const c = await exec('baja/lib/confirm.js', 'Remove ' + shown.length + ' matching SNP' + (shown.length === 1 ? '' : 's') + ' [' + what + ']? This cannot be undone.', () => { doRemove(); });
                        showModal(c);
                    } catch (e) { doRemove(); }
                }
            },
            {
                // KEEP THE 10 MOST COMMON, REMOVE THE REST. "Common" is the allele frequency the
                // variant carries (AF, from gnomAD / dbSNP / the VCF INFO), and, where several
                // variants have no AF or the same AF, how many times that same change (position,
                // ref, alt) appears on the track, e.g. once per sample. Every copy of a kept change
                // stays. Scoped like the rest of this menu: with a selection, only the variants in
                // it are ranked and removed, and everything outside it is left alone.
                label: 'Remove uncommon variants (keep top 10, gnomAD)', move: () => { }, click: async () => {
                    const TOP = 10;
                    // 1) GLOBAL frequency: look every variant up in gnomAD (v4, ~800k people), so
                    //    "common" means common in the species, not common on this track.
                    const gn = await __vf_gnomad(pool);
                    // With gnomAD answering, rank only what it could assess; a variant whose region
                    // could not be looked up is KEPT (never removed on a failed lookup) and left out
                    // of the ranking. Without gnomAD at all, fall back to the variants' own AF and
                    // how often each occurs, and say so.
                    const rankPool = gn.ok ? pool.filter((s) => s.gnomadAf != null) : pool;
                    __vf_status('Ranking ' + __vf_fmt(M) + ' variants on ' + __vf_tname + ' by how common they are…');
                    await __vf_tick();
                    __vf_done();
                    const keyOf = (s) => [s.xi, ('' + (s.reference ?? '')).toUpperCase(), ('' + (s.alternate ?? '')).toUpperCase(), s.type].join('|');
                    const groups = new Map();
                    for (const s of rankPool) {
                        const k = keyOf(s);
                        let g = groups.get(k);
                        if (!g) { g = { key: k, n: 0, af: null, first: s }; groups.set(k, g); }
                        g.n++;
                        // gnomAD first (0 = looked up and not seen); the variant's own AF otherwise
                        const af = (s.gnomadAf != null) ? +s.gnomadAf : readAf(s);
                        if (af != null && (g.af == null || af > g.af)) g.af = af;
                    }
                    const ranked = Array.from(groups.values()).sort((a, b) =>
                        ((b.af ?? -1) - (a.af ?? -1)) || (b.n - a.n) || (a.first.xi - b.first.xi));
                    if (ranked.length <= TOP) {
                        graph.setMessage(' Only ' + ranked.length + ' distinct variant' + (ranked.length === 1 ? '' : 's')
                            + (range ? ' in the selection' : ' on the track') + '; nothing to remove. ');
                        return;
                    }
                    const anyAf = ranked.some((g) => g.af != null && g.af > 0), anyRepeat = ranked.some((g) => g.n > 1);
                    if (!anyAf && !anyRepeat) {
                        graph.setMessage(' Cannot rank these variants: ' + (gn.ok ? 'none of them is in gnomAD' : 'gnomAD could not be reached (' + gn.why + ')')
                            + ', none carries an allele frequency, and none occurs more than once. ');
                        return;
                    }
                    const gnText = gn.ok ? ('global allele frequency in gnomAD v4 (' + gn.found + ' found, ' + gn.absent + ' not in gnomAD'
                        + (gn.unknown ? '; ' + gn.unknown + ' could not be looked up and are kept' : '') + ')')
                        : ('the variants\' own allele frequency, since gnomAD could not be reached (' + gn.why + ')');
                    const keep = new Set(ranked.slice(0, TOP).map((g) => g.key));
                    const doomed = new Set(rankPool.filter((s) => !keep.has(keyOf(s))));
                    const basis = anyAf ? ((gnText || 'allele frequency') + (anyRepeat ? ', then how often each occurs' : '')) : 'how often each occurs on the track';
                    const doRemove = () => __vf_busy('Removing variants from ' + __vf_tname + '…', () => {
                        try { graph.pushOntoHistory(); } catch (e) { }
                        const before = track.snpindels.length;
                        track.snpindels = track.snpindels.filter((s) => !doomed.has(s));
                        const rm = before - track.snpindels.length;
                        let childRm = 0;
                        try { if (track.clearDescendantSnps) childRm = track.clearDescendantSnps(graph); } catch (e) { }
                        if (graph.wake) graph.wake();
                        const top = ranked.slice(0, 3).map((g) => (g.first.name || g.first.id || (g.first.reference + '>' + g.first.alternate))
                            + (g.af != null ? (g.af > 0 ? ' AF ' + (+g.af).toPrecision(2) : ' not in gnomAD') : '') + (g.n > 1 ? ' ×' + g.n : '')).join(', ');
                        graph.setMessage(' Kept the ' + TOP + ' most common variants (by ' + basis + '; top: ' + top + '); removed ' + rm
                            + (childRm ? ' (+' + childRm + ' from child tracks)' : '') + '. ' + track.snpindels.length + ' remain. ');
                        if (graph.hideMenu) graph.hideMenu();
                    });
                    if (graph.hideMenu) graph.hideMenu();
                    try {
                        const c = await exec('baja/lib/confirm.js', 'Keep the ' + TOP + ' most common variants ' + (range ? 'in the selection' : 'on this track')
                            + ' (ranked by ' + basis + ') and remove the other ' + doomed.size + '?', () => { doRemove(); });
                        showModal(c);
                    } catch (e) { doRemove(); }
                }
            },
            {
                label: 'Advanced (form)…', move: () => { }, click: async () => {
                    if (graph.hideMenu) graph.hideMenu();
                    exec('baja/manchester/menu/edit-snps-panel.js', graph, genegraph_panel_layout, track);
                }
            }
        );
        graph.showMenu(items);
    };

    mainMenu();
    } finally { __vf_done(); }
    })();
}
