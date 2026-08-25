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
    const apply = () => { let shown = 0; for (const s of snps) { s.hidden = !matches(s); if (!s.hidden) shown++; } track.showSnpIndels = true; if (graph.wake) graph.wake(); return shown; };

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
            { label: 'Any / clear', move: () => { }, click: () => { F.clinGroup = null; F.clinsig = null; const n = apply(); graph.setMessage(' Clinical filter cleared — ' + n + ' shown. '); mainMenu(); } },
        ];
        // Grouped presets (only those with matches).
        const addGroup = (key, label) => {
            const cnt = pool.filter((s) => inClinGroup(s, key)).length;
            if (!cnt) return;
            items.push({
                label: (F.clinGroup === key ? '✓ ' : '') + label + '  (' + cnt + ')', move: () => { },
                click: () => { F.clinGroup = key; F.clinsig = null; const n = apply(); graph.setMessage(' ' + label + ' — ' + n + ' of ' + M + ' shown. '); mainMenu(); }
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
                click: () => { F.clinsig = k; F.clinGroup = null; const n = apply(); graph.setMessage(' clinsig = ' + k + ' — ' + n + ' of ' + M + ' shown. '); mainMenu(); }
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
                label: 'Any / clear', move: () => { }, click: () => {
                    setFn(null); const n = apply();
                    graph.setMessage(' ' + title + ' filter cleared — ' + n + ' of ' + M + ' shown. ');
                    mainMenu();
                }
            },
        ];
        Object.keys(tallyObj).sort((a, b) => tallyObj[b] - tallyObj[a]).forEach((k) => {
            items.push({
                label: (current === k ? '✓ ' : '') + k + '  (' + tallyObj[k] + ')', move: () => { }, click: () => {
                    setFn(k); const n = apply();
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
            { label: 'Any / clear', move: () => { }, click: () => { F.minAf = null; const n = apply(); graph.setMessage(' AF filter cleared — ' + n + ' shown. '); mainMenu(); } },
        ];
        [0.10, 0.05, 0.01, 0.001].forEach((th) => {
            items.push({
                label: (F.minAf === th ? '✓ ' : '') + 'AF ≥ ' + th, move: () => { }, click: () => {
                    F.minAf = th; const n = apply();
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
                label: 'Show all (clear filters)', move: () => { }, click: () => {
                    F.type = F.source = F.clinsig = F.clinGroup = F.consequence = F.quality = F.phase = null; F.minAf = null;
                    apply();
                    graph.setMessage(' Filters cleared — showing all ' + M + ' SNPs. ');
                    mainMenu();
                }
            },
            {
                label: 'Remove hidden', move: () => { }, click: async () => {
                    const hiddenCount = track.snpindels.filter((s) => s.hidden).length;
                    if (!hiddenCount) { graph.setMessage(' No hidden SNPs to remove. '); return; }
                    const doRemove = () => {
                        const before = track.snpindels.length;
                        track.snpindels = track.snpindels.filter((s) => !s.hidden);
                        const rm = before - track.snpindels.length;
                        let childRm = 0;
                        try { if (track.clearDescendantSnps) childRm = track.clearDescendantSnps(graph); } catch (e) { }
                        if (graph.wake) graph.wake();
                        graph.setMessage(' Removed ' + rm + ' hidden SNP' + (rm === 1 ? '' : 's')
                            + (childRm ? ' (+' + childRm + ' from child tracks)' : '') + '; ' + track.snpindels.length + ' remain. ');
                        if (graph.hideMenu) graph.hideMenu();
                    };
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
                    const doRemove = () => {
                        const before = track.snpindels.length;
                        track.snpindels = track.snpindels.filter((s) => s.hidden);   // keep hidden, drop the matching
                        const rm = before - track.snpindels.length;
                        let childRm = 0;
                        try { if (track.clearDescendantSnps) childRm = track.clearDescendantSnps(graph); } catch (e) { }
                        if (graph.wake) graph.wake();
                        graph.setMessage(' Removed ' + rm + ' matching SNP' + (rm === 1 ? '' : 's')
                            + (childRm ? ' (+' + childRm + ' from child tracks)' : '') + '; ' + track.snpindels.length + ' remain. ');
                        if (graph.hideMenu) graph.hideMenu();
                    };
                    if (graph.hideMenu) graph.hideMenu();
                    try {
                        const c = await exec('baja/lib/confirm.js', 'Remove ' + shown.length + ' matching SNP' + (shown.length === 1 ? '' : 's') + ' [' + what + ']? This cannot be undone.', () => { doRemove(); });
                        showModal(c);
                    } catch (e) { doRemove(); }
                }
            },
            {
                label: 'Advanced (form)…', move: () => { }, click: () => {
                    if (graph.hideMenu) graph.hideMenu();
                    exec('baja/manchester/menu/edit-snps-panel.js', graph, genegraph_panel_layout, track);
                }
            }
        );
        graph.showMenu(items);
    };

    mainMenu();
}
