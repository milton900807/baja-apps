function (graph, genegraph_panel_layout) {

    // Expose a re-arm hook so code that clears mouse listeners (e.g. an animated zoom in
    // gene.js, which has no panel-layout reference) can restore the hover highlight.
    try {
        graph.__hoverRearm = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
    } catch (e) { }

    // Paste-an-image → tracks is now an EXPLICIT action ("Parse mutations from image" in the
    // paste panel, manchester/controls/paste-panel.js) rather than an automatic global paste
    // listener, so the one-time listener installer is intentionally not wired up here.
    // try { exec('baja/manchester/menu/paste-image-extract.js', graph, genegraph_panel_layout); } catch (e) { }

    return new Promise(async (resolve, reject) => {
        let move = null;
        let md = false;

        xi = 0;
        yi = 0
        let diffx = 0
        let diffy = 0
        let MenuFactory = await exec('baja/manchester/menu/menu-factory.js')
        let panel;

        // Any submenu opened from a menu-item click is deferred ~1s so it does not
        // collide with the in-progress canvas mouse interaction that triggered the
        // click. Closing a menu (null) still happens immediately.
        const MENU_OPEN_DELAY_MS = 100;
        // Consistent menu ordering: items that open a SUBMENU (label carries the ▸ marker) are
        // grouped FIRST, then leaf actions, with navigation (‹ Back / Cancel / Close / Done) last.
        // Header rows stay pinned at the very top. Applied to every menu this file shows.
        const orderMenu = (list) => {
            try {
                if (!Array.isArray(list) || list.length < 2) return list;
                const lab = (it) => ('' + (it && (it.label || it.name || ''))).trim();
                const isHeader = (it) => !!(it && it.header);
                const isNav = (it) => { const l = lab(it); return /^(‹|«|<|←|✓|↩)/.test(l) || /(^|\s)(Back|Cancel|Close|Done)\b/i.test(l) || /Back$/i.test(l) || l === 'more...' || l === 'Refresh menu' || l === 'Close menu'; };
                const isSub = (it) => /[▸►]/.test(lab(it));
                const headers = [], subs = [], leaves = [], navs = [];
                for (const it of list) {
                    if (!it) { leaves.push(it); continue; }
                    if (isHeader(it)) headers.push(it);
                    else if (isNav(it)) navs.push(it);
                    else if (isSub(it)) subs.push(it);
                    else leaves.push(it);
                }
                return headers.concat(subs, leaves, navs);
            } catch (e) { return list; }
        };
        // `label` names the menu in the panel header. Forwarded rather than dropped: every
        // caller routed through here would otherwise lose the context it already has.
        const showSideMenuDelayed = (menu, x, y, label) => {
            if (menu == null) { if (graph && graph.showSideMenu) graph.showSideMenu(null); return; }
            setTimeout(() => { if (graph && graph.showSideMenu) graph.showSideMenu(orderMenu(menu), x, y, label); }, MENU_OPEN_DELAY_MS);
        };
        // On mobile the full-screen feature menu is blocking, so a quick tap only SELECTS —
        // the menu opens on a LONG-PRESS (~500ms held still), armed as graph.graph.__longPressReady
        // by flexigraph/graph.js. Desktop is unaffected.
        const __menuAllowedOnTap = () => { try { return (typeof isMobile !== 'function') || !isMobile() || !!(graph && graph.graph && graph.graph.__longPressReady); } catch (e) { return true; } };
        const showWindowMenuDelayed = (menu, a, b, c) => {
            setTimeout(() => { if (graph && graph.showWindowMenu) graph.showWindowMenu(menu, a, b, c); }, MENU_OPEN_DELAY_MS);
        };

        // If a SNP was selected on mouse-down, fold its menu into the context menu
        // that mouse-up is about to show, as a leading item that opens the snp-menu.
        const mergePendingSnp = (items) => {
            if (graph.__pendingSnp && Array.isArray(items)) {
                const pend = graph.__pendingSnp;
                items = [
                    { label: pend.label, click: () => graph.showSideMenu(pend.snpMenu, null, (pend.label || 'Variant') + ' ▸') },
                    { type: 'separator' },
                    ...items
                ];
            }
            return items;
        };
        const getAmpliconMenuItems = (selectedTrack, graph) => {
            let t = [
                {
                    label: 'Amplicons',
                    click: () => {
                        const selTrack = selectedTrack;

                        const _ml = [];

                        _ml.push({
                            label: selTrack.showAmplicons ? 'Hide Amplicons' : 'Show Amplicons',
                            click: async () => {
                                selTrack.showAmplicons = !selTrack.showAmplicons;
                            }
                        });

                        const gwcxs = graph.Xwc(0);
                        if (gwcxs == null) return;
                        const gwcxf = graph.Xwc(graph.grid?.width ?? 0);
                        if (gwcxf == null) return;

                        const tg = selTrack?.tgraph;
                        if (!tg) return;

                        const twcxs = tg.Xwc(gwcxs - 2 * tg.xi);
                        const twcxf = tg.Xwc(gwcxf - 2 * tg.xi);
                        if (twcxs == null || twcxf == null) return;

                        const rawHits =
                            selTrack.ampliconResults ||
                            selTrack.primerAmpliconResults ||
                            selTrack.ctModelAmplicons ||
                            selTrack.primer3Hits ||
                            selTrack.amplicon_hits;

                        const fallbackNormalizeAmpliconHits = (input) => {
                            if (!input) return [];
                            if (Array.isArray(input)) return input;
                            if (typeof input === "string") {
                                try { return fallbackNormalizeAmpliconHits(JSON.parse(input)); }
                                catch { return []; }
                            }
                            if (typeof input === "object") {
                                if (Number.isFinite(input.length)) {
                                    const out = [];
                                    for (let i = 0; i < input.length; i++) if (i in input) out.push(input[i]);
                                    return out;
                                }
                                const keys = Object.keys(input)
                                    .filter(k => String(+k) === k)
                                    .sort((a, b) => +a - +b);
                                if (keys.length) return keys.map(k => input[k]);
                            }
                            return [];
                        };

                        const hits =
                            (typeof normalizeAmpliconHits === "function")
                                ? normalizeAmpliconHits(rawHits)
                                : fallbackNormalizeAmpliconHits(rawHits);

                        const vx0 = Math.min(twcxs, twcxf);
                        const vx1 = Math.max(twcxs, twcxf);
                        const hitsv = (hits || []).filter(h => {
                            const a0 = +h?.amp_start;
                            const a1 = +h?.amp_end;
                            if (!Number.isFinite(a0) || !Number.isFinite(a1) || a1 <= a0) return false;
                            return !(a1 < vx0 || a0 > vx1);
                        });

                        if (hitsv.length > 0) {
                            _ml.push({
                                label: `Remove (visible) amplicons (${hitsv.length})`,
                                click: async () => {
                                    setTimeout(async () => {
                                        graph.pushOntoHistory();
                                        if (Array.isArray(selTrack.ampliconResults)) {
                                            const visSet = new Set(hitsv);
                                            selTrack.ampliconResults = selTrack.ampliconResults.filter(h => !visSet.has(h));
                                        } else {
                                            selTrack.ampliconResults = [];
                                        }
                                    });
                                }
                            });
                        }

                        function showAmpliconFilterSideMenu(graph, selectedTrack, distinctLimit = 20) {
                            const menuItems = [];
                            const amps = selectedTrack?.ampliconResults?.hits
                            const toStr = (v) => (v === null || v === undefined ? "" : String(v));
                            const isNonEmpty = (s) => s.trim().length > 0;

                            const toNum = (v) => {
                                if (v === null || v === undefined) return null;
                                const n = Number(v);
                                return Number.isFinite(n) ? n : null;
                            };

                            const getStore = () => (Array.isArray(selectedTrack.ampliconResults) ? selectedTrack.ampliconResults : amps);

                            const removeWhere = (predicate) => {
                                const store = getStore();
                                const filtered = store.filter((a) => !predicate(a));
                                if (store === selectedTrack.ampliconResults) selectedTrack.ampliconResults = filtered;
                                else { store.length = 0; store.push(...filtered); }
                            };

                            const keepWhere = (predicate) => {
                                const store = getStore();
                                const filtered = store.filter((a) => predicate(a));
                                if (store === selectedTrack.ampliconResults) selectedTrack.ampliconResults = filtered;
                                else { store.length = 0; store.push(...filtered); }
                            };

                            const parseEnteredToSet = (entered) => {
                                const s = (entered ?? "").toString().trim();
                                if (!s) return new Set();
                                return new Set(s.split(/[,\s]+/g).map((x) => x.trim()).filter(Boolean));
                            };

                            function distinctCounts(fieldAccessor) {
                                const counts = new Map();
                                for (const a of amps) {
                                    const vs = toStr(fieldAccessor(a)).trim();
                                    if (!isNonEmpty(vs)) continue;
                                    counts.set(vs, (counts.get(vs) ?? 0) + 1);
                                }
                                return [...counts.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
                            }

                            function makeDistinctValuesFilterMenu(attrLabel, fieldAccessor) {
                                const values = distinctCounts(fieldAccessor);
                                if (values.length === 0 || values.length >= distinctLimit) return null;

                                const submenu = values.map(([valueStr, count]) => ({
                                    label: `${valueStr} (${count})`,
                                    click: async () => {
                                        const ssubmenu = [
                                            {
                                                label: `Keep only`,
                                                click: () => {
                                                    keepWhere((a) => toStr(fieldAccessor(a)).trim() === valueStr);
                                                    graph.showSideMenu(null);
                                                }
                                            },
                                            {
                                                label: `Remove`,
                                                click: () => {
                                                    removeWhere((a) => toStr(fieldAccessor(a)).trim() === valueStr);
                                                    graph.showSideMenu(null);
                                                }
                                            }
                                        ];
                                        showSideMenuDelayed(ssubmenu);
                                    }
                                }));

                                return { label: `Filter ${attrLabel}`, click: () => showSideMenuDelayed(submenu) };
                            }

                            function makePromptFilterItem(attrLabel, promptTitle, promptFieldLabel, fieldAccessor) {
                                const first = amps[0] ?? {};
                                const defaultValue = fieldAccessor(first);

                                return {
                                    label: `Filter ${attrLabel}…`,
                                    click: async () => {
                                        const res = await prompt(
                                            promptTitle,
                                            [promptFieldLabel],
                                            { [promptFieldLabel]: toStr(defaultValue) },
                                            600,
                                            300
                                        );
                                        const entered = res?.[promptFieldLabel];
                                        const enteredSet = parseEnteredToSet(entered);
                                        if (enteredSet.size === 0) return;

                                        removeWhere((a) => {
                                            const vs = toStr(fieldAccessor(a)).trim();
                                            if (!isNonEmpty(vs)) return false;
                                            return enteredSet.has(vs);
                                        });
                                    }
                                };
                            }

                            function addAttribute(attrLabel, promptTitle, promptFieldLabel, fieldAccessor) {
                                const distinctMenu = makeDistinctValuesFilterMenu(attrLabel, fieldAccessor);
                                if (distinctMenu) menuItems.push(distinctMenu);
                                else menuItems.push(makePromptFilterItem(attrLabel, promptTitle, promptFieldLabel, fieldAccessor));
                            }

                            function addNumericComparator(attrLabel, fieldAccessor, promptTitle = `${attrLabel} filter`) {
                                const first = amps[0] ?? {};
                                const defaultValue = toNum(fieldAccessor(first));

                                const askNumber = async (title, fieldLabel, defVal) => {
                                    const res = await prompt(
                                        title,
                                        [fieldLabel],
                                        { [fieldLabel]: defVal === null ? "" : String(defVal) },
                                        600,
                                        300
                                    );
                                    return toNum(res?.[fieldLabel]);
                                };

                                menuItems.push({
                                    label: `Filter ${attrLabel}`,
                                    click: () => {
                                        const submenu = [
                                            {
                                                label: `${attrLabel} < …`,
                                                click: async () => {
                                                    const n = await askNumber(promptTitle, "Value", defaultValue);
                                                    if (n === null) return;
                                                    keepWhere((a) => {
                                                        const v = toNum(fieldAccessor(a));
                                                        return v !== null && v < n;
                                                    });
                                                    graph.showSideMenu(null);
                                                }
                                            },
                                            {
                                                label: `${attrLabel} > …`,
                                                click: async () => {
                                                    const n = await askNumber(promptTitle, "Value", defaultValue);
                                                    if (n === null) return;
                                                    keepWhere((a) => {
                                                        const v = toNum(fieldAccessor(a));
                                                        return v !== null && v > n;
                                                    });
                                                    graph.showSideMenu(null);
                                                }
                                            },
                                            { type: "separator" },
                                            {
                                                label: `${attrLabel} between …`,
                                                click: async () => {
                                                    const lo = await askNumber(promptTitle, "Min", defaultValue);
                                                    if (lo === null) return;
                                                    const hi = await askNumber(promptTitle, "Max", defaultValue);
                                                    if (hi === null) return;

                                                    const min = Math.min(lo, hi);
                                                    const max = Math.max(lo, hi);

                                                    keepWhere((a) => {
                                                        const v = toNum(fieldAccessor(a));
                                                        return v !== null && v >= min && v <= max;
                                                    });
                                                    graph.showSideMenu(null);
                                                }
                                            }
                                        ];
                                        showSideMenuDelayed(submenu);
                                    }
                                });
                            }

                            if (amps.length > 0) {
                                menuItems.push({
                                    label: `Export sequences`, click: async () => {

                                        const headers = Object.keys(amps[0]);

                                        const escapeValue = (value) => {
                                            if (value === null || value === undefined) return "";
                                            const str = String(value);
                                            if (str.includes('"') || str.includes(',') || str.includes('\n')) {
                                                return `"${str.replace(/"/g, '""')}"`;
                                            }
                                            return str;
                                        };

                                        const csvRows = [];

                                        csvRows.push(headers.join(","));

                                        for (const row of amps) {
                                            const values = headers.map(h => escapeValue(row[h]));
                                            csvRows.push(values.join(","));
                                        }

                                        let v = csvRows.join("\n");
                                        downloadAsCsv(amps, 'amplicsons')

                                        showModal({
                                            wid: 'text-editor',
                                            data: {
                                                height: "500px",
                                                showButton: false,
                                                text: v,
                                                editorOptions: {
                                                    value: v,
                                                    language: 'text', automaticLayout: true, fontSize: 14, lineNumbers: "on",
                                                    suggestOnTriggerCharacters: false,
                                                    quickSuggestions: false,
                                                    parameterHints: { enabled: false },
                                                    minimap: { enabled: false },
                                                    fontFamily: "Courier New, monospace",
                                                    placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                    cursorStyle: "block"
                                                },
                                                onDidFocusEditorWidget: createIon(() => {
                                                    if (initalText)
                                                        sequenceTextEditor.setContent("")
                                                    initalText = false;
                                                }),
                                                keybinding: {
                                                    'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                    })
                                                },
                                            }
                                        })

                                    }
                                });

                            }

                            addNumericComparator("Score", (a) => a.prob_good_ct_lt_threshold, "Score");

                            menuItems.push({
                                label: 'Remove all',
                                click: async () => {
                                    let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to delete this?', async () => {
                                        try { graph.pushOntoHistory(); } catch (e) { }   // Ctrl+Z restores
                                        selectedTrack.ampliconResults = [];
                                    });
                                    showModal(confirm);
                                }
                            });

                            if (__menuAllowedOnTap()) showSideMenuDelayed(menuItems);
                        }

                        showAmpliconFilterSideMenu(graph, selTrack, 20);
                    }
                }
            ];
            return t;
        };

        // Edit-amplicon mode: click a primer/probe of THIS amplicon and drag it left/
        // right along the track. Exact inverse of tgraph.X() maps screen->world so the
        // grabbed part follows the cursor; click empty space (miss all parts) to finish.
        function editAmpliconX(graph, track, amp) {
            if (!track || !track.tgraph || !amp) return;
            const tg = track.tgraph;
            const worldX = (mx) => (mx - tg.xinset - tg.xi) / (tg.xscale || 1) - tg.xshift;
            const parts = () => [amp.left, amp.right, amp.mid].filter(Boolean);

            graph.clearMouseListeners();
            try { graph.deselectAllTracks && graph.deselectAllTracks(); } catch (e) { }
            graph.setMouseMode('msg: Edit amplicon — click a primer and drag left/right. Click empty space to finish.');

            let grab = null;
            graph.addMouseDownListener((mx, my) => {
                const wx = worldX(mx);
                let hit = null;
                for (const p of parts()) {
                    const lo = Math.min(+p.xi, +p.xf), hi = Math.max(+p.xi, +p.xf);
                    const tol = Math.max(1, (hi - lo) * 0.15);
                    if (wx >= lo - tol && wx <= hi + tol) { hit = p; break; }
                }
                if (!hit) {                       // missed every part → leave edit mode
                    graph.clearMouseListeners();
                    graph.setMouseMode('navigate');
                    if (graph.wake) graph.wake();
                    return;
                }
                try { graph.pushOntoHistory(); } catch (e) { }
                grab = { part: hit, startXi: +hit.xi, startXf: +hit.xf, down: wx };
            });
            graph.addMouseMoveListener((mx, my) => {
                if (!grab) return;
                const d = Math.round(worldX(mx) - grab.down);
                grab.part.xi = grab.startXi + d;
                grab.part.xf = grab.startXf + d;
                // Re-read the track sequence under the primer at its new position so
                // Tm/GC (recomputed in Amplicon.draw from part.sequence) update as it
                // moves. GC% and Tm are invariant under reverse-complement, so the
                // sense-strand range is correct for both forward and reverse primers.
                try {
                    const lo = Math.min(grab.part.xi, grab.part.xf);
                    const hi = Math.max(grab.part.xi, grab.part.xf);
                    const seq = track.getSequenceRange(lo, hi);
                    if (seq && seq.length) grab.part.sequence = seq;
                } catch (e) { }
                // keep the amplicon span in sync for rendering / hit-tests
                if (amp.left && amp.right) {
                    amp.xi = Math.min(+amp.left.xi, +amp.right.xi);
                    amp.xf = Math.max(+amp.left.xf, +amp.right.xf);
                }
                if (graph.wake) graph.wake();
            });
            graph.addMouseUpListener((mx, my) => {
                grab = null;
                if (graph.wake) graph.wake();
            });
        }

        function showOneAmpliconMenu(graph, selectedTrack, amp, immediate) {
            const toNum = (v) => {
                const n = Number(v);
                return Number.isFinite(n) ? n : null;
            };

            const getStore = () =>
                Array.isArray(selectedTrack.ampliconResults) ? selectedTrack.ampliconResults : (hits || []);

            // Amplicon objects created by the primer-probe design live in t.oligos
            // (type==='amplicon'), NOT in ampliconResults — support both stores so
            // "keep/remove this amplicon" works regardless of where it lives.
            const inOligos = Array.isArray(selectedTrack.oligos) && selectedTrack.oligos.indexOf(amp) >= 0;
            const removeThisAmp = () => {
                try { graph.pushOntoHistory(); } catch (e) { }
                if (inOligos) {
                    const i = selectedTrack.oligos.indexOf(amp);
                    if (i >= 0) selectedTrack.oligos.splice(i, 1);
                } else { removeWhere((a) => a === amp); }
            };
            const keepOnlyThisAmp = () => {
                try { graph.pushOntoHistory(); } catch (e) { }
                if (inOligos) {
                    // Drop the other amplicon-type oligos; leave true oligos alone.
                    selectedTrack.oligos = selectedTrack.oligos.filter((o) => o.type !== 'amplicon' || o === amp);
                } else { keepWhere((a) => a === amp); }
            };

            const keepWhere = (pred) => {
                const store = getStore();
                const filtered = store.filter(pred);
                if (store === selectedTrack.ampliconResults) selectedTrack.ampliconResults = filtered;
                else { store.length = 0; store.push(...filtered); }
            };

            const removeWhere = (pred) => {
                const store = getStore();
                const filtered = store.filter((a) => !pred(a));
                if (store === selectedTrack.ampliconResults) selectedTrack.ampliconResults = filtered;
                else { store.length = 0; store.push(...filtered); }
            };

            const score = toNum(amp?.prob_good_ct_lt_threshold);

            const submenu = [
                {
                    label: "Keep only this amplicon",
                    click: () => {
                        keepOnlyThisAmp();
                        graph.showSideMenu(null);
                        if (graph.wake) graph.wake();
                    }
                },
                {
                    label: "Remove this amplicon",
                    click: () => {
                        removeThisAmp();
                        graph.showSideMenu(null);
                        if (graph.wake) graph.wake();
                    }
                },
                {
                    label: "Edit amplicon (drag primers)",
                    click: () => {
                        graph.showSideMenu(null);
                        try { graph.side_menu = null; } catch (e) { }   // else the engine skips move listeners
                        editAmpliconX(graph, selectedTrack, amp);
                    }
                },
                { type: "separator" },

                {
                    label: score === null ? "Keep amplicons with Score < (unavailable)" : `Keep Score < ${score}`,
                    enabled: score !== null,
                    click: () => {
                        keepWhere((a) => toNum(a?.prob_good_ct_lt_threshold) !== null && toNum(a.prob_good_ct_lt_threshold) < toNum(score));
                        graph.showSideMenu(null);
                    }
                },
                {
                    label: score === null ? "Keep amplicons with Score > (unavailable)" : `Keep Score > ${score}`,
                    enabled: score !== null,
                    click: () => {
                        keepWhere((a) => toNum(a?.prob_good_ct_lt_threshold) !== null && toNum(a.prob_good_ct_lt_threshold) > toNum(score));
                        graph.showSideMenu(null);
                    }
                },
                {
                    label: score === null ? "Keep amplicons with Score = (unavailable)" : `Keep Score = ${score}`,
                    enabled: score !== null,
                    click: () => {
                        keepWhere((a) => toNum(a?.prob_good_ct_lt_threshold) === toNum(score));
                        graph.showSideMenu(null);
                    }
                },
                {
                    label: score === null ? "Remove amplicons with Score = (unavailable)" : `Remove Score = ${score}`,
                    enabled: score !== null,
                    click: () => {
                        removeWhere((a) => toNum(a?.prob_good_ct_lt_threshold) === toNum(score));
                        graph.showSideMenu(null);
                    }
                },

                { type: "separator" },
                {
                    label: "Copy amp coordinates",
                    click: async () => {
                        const a0 = amp?.amp_start ?? amp?.xi ?? "";
                        const a1 = amp?.amp_end ?? amp?.xf ?? "";
                        const s = `${a0}-${a1}`;
                        try { await navigator.clipboard.writeText(s); } catch { }
                        graph.showSideMenu(null);
                    }
                }
            ];

            // From the selection window we want the menu NOW; from hover we keep the
            // small delay that avoids colliding with the in-progress mouse gesture.
            if (immediate) graph.showSideMenu(submenu, null, 'Amplicon ▸');
            else showSideMenuDelayed(submenu, undefined, undefined, 'Amplicon ▸');
        }

        // Off-target statistics popup (navy demo look-and-feel), opened by clicking a count badge.
        // When the count is < 20, every individual hit (gene symbol + locus + edit distance) is listed.
        const showOffTargetStats = (o) => {
            try {
                const old = document.getElementById('baja-ot-stats'); if (old && old.parentNode) old.parentNode.removeChild(old);
                const hits = Array.isArray(o.offtarget) ? o.offtarget : [];
                const isStr = (typeof o.offtarget === 'string');
                const count = isStr ? (parseInt(o.offtarget, 10) || 0) : hits.length;
                let genes = [];
                if (Array.isArray(o.offtargetsymbols) && o.offtargetsymbols.length) genes = o.offtargetsymbols.slice();
                else genes = Array.from(new Set(hits.map((h) => h && h.symbol).filter(Boolean)));
                const distinct = (o.offtargetGeneCount != null) ? o.offtargetGeneCount : new Set(genes.map((g) => ('' + g).trim())).size;
                const nm = o.name || o.id || 'oligo';
                const esc = (s) => ('' + s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const row = (k, v) => '<tr><td style="padding:4px 18px 4px 0;color:#8fb8c8;white-space:nowrap;">' + k + '</td><td style="padding:4px 0;font-weight:600;color:#fff;">' + v + '</td></tr>';
                let body = '<table style="border-collapse:collapse;font-size:13px;">'
                    + row('Off-target hits', count.toLocaleString())
                    + row('Distinct genes', (distinct || 0).toLocaleString())
                    + '</table>';
                if (count < 20) {
                    let listHtml = '';
                    if (hits.length) {
                        listHtml = hits.map((h) => {
                            const sym = (h && h.symbol) ? esc(h.symbol) : '—';
                            const loc = (h && h.chr != null) ? esc(h.chr + (h.start != null ? (':' + h.start) : '') + (h.end != null ? ('-' + h.end) : '')) : '';
                            const ed = (h && h.editdistance != null) ? ('edit ' + h.editdistance) : '';
                            return '<div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0;border-top:1px solid rgba(255,255,255,0.08);font-size:12px;"><span style="color:#eaf6f9;">' + sym + '</span><span style="color:#8fb8c8;font-family:monospace;">' + loc + ' ' + ed + '</span></div>';
                        }).join('');
                    } else if (genes.length) {
                        listHtml = '<div style="color:#eaf6f9;font-size:12px;line-height:1.6;">' + genes.map(esc).join(', ') + '</div>';
                    }
                    if (listHtml) body += '<div style="margin-top:12px;font:700 12px Arial;color:#4fd0e6;">All hits</div><div style="max-height:280px;overflow:auto;margin-top:4px;">' + listHtml + '</div>';
                } else {
                    body += '<div style="margin-top:12px;color:#8fb8c8;font-size:12px;">' + count.toLocaleString() + ' hits — too many to list individually. Genes: <span style="color:#eaf6f9;">' + genes.slice(0, 10).map(esc).join(', ') + (genes.length > 10 ? ', …' : '') + '</span></div>';
                }
                const panel = document.createElement('div');
                panel.id = 'baja-ot-stats';
                panel.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:2147483000;width:min(560px,94vw);max-height:82vh;overflow:auto;background:#0b2545;color:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.14);font-family:Arial,Helvetica,sans-serif;padding:18px;';
                panel.innerHTML = '<div style="font:700 16px Arial;margin-bottom:8px;">Off-target statistics — ' + esc(nm) + '</div>' + body
                    + '<div style="display:flex;justify-content:flex-end;margin-top:16px;"><button id="ot-close" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 13px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">Close</button></div>';
                document.body.appendChild(panel);
                const cb = panel.querySelector('#ot-close');
                if (cb) cb.onclick = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
            } catch (e) { }
        };

        const getOligoMenuItems = (selectedTrack, graph) => {
            let t = [
                {
                    label: 'Oligos',
                    click: () => {
                        const selTrack = selectedTrack;

                        const _ml = [];
                        _ml.push({
                            label: selTrack.showOligos ? 'Hide Oligos' : 'Show Oligos',
                            click: async () => {
                                selTrack.showOligos = !selTrack.showOligos;
                            }
                        });

                        const gwcxs = graph.Xwc(0);
                        if (gwcxs == null) return;
                        const gwcxf = graph.Xwc(graph.grid?.width ?? 0);
                        if (gwcxf == null) return;

                        const tg = selTrack?.tgraph;
                        if (!tg) return;

                        const twcxs = tg.Xwc(gwcxs - 2 * tg.xi);
                        const twcxf = tg.Xwc(gwcxf - 2 * tg.xi);
                        if (twcxs == null || twcxf == null) return;

                        const vx0 = Math.min(twcxs, twcxf);
                        const vx1 = Math.max(twcxs, twcxf);

                        const oligos = selTrack?.oligos ?? [];
                        const oligosv = oligos.filter(o => {
                            const xi = Number.isFinite(o?.xi) ? o.xi : (Number.isFinite(o?.x) ? o.x : NaN);
                            const xf = Number.isFinite(o?.xf) ? o.xf : (Number.isFinite(o?.x) ? o.x : NaN);
                            if (!Number.isFinite(xi) || !Number.isFinite(xf)) return false;
                            const a0 = Math.min(xi, xf);
                            const a1 = Math.max(xi, xf);
                            return !(a1 < vx0 || a0 > vx1);
                        });

                        if (oligosv.length > 0) {
                            _ml.push({
                                label: `Remove (visible) oligos (${oligosv.length})`,
                                click: async () => {
                                    setTimeout(async () => {
                                        graph.pushOntoHistory();
                                        const visSet = new Set(oligosv);
                                        selTrack.oligos = (selTrack.oligos ?? []).filter(o => !visSet.has(o));
                                    });
                                }
                            });
                        }

                        // Oligos that overlap an amplicon on this track (drawn magenta with
                        // a warning label). Amplicons live in oligos as Amplicon objects
                        // (type 'amplicon' / left+right primers), so they share the coord
                        // space and overlap is a direct interval test.
                        const __isAmp = (o) => !!(o && (o.type === 'amplicon' || (o.left && o.right)));
                        const __ampSpans = [];
                        for (const a of oligos) {
                            if (!__isAmp(a)) continue;
                            const s = Number.isFinite(a.xi) ? a.xi : (a.left && a.left.xi);
                            const e = (a.right && Number.isFinite(a.right.xf)) ? a.right.xf : a.xf;
                            if (Number.isFinite(s) && Number.isFinite(e) && e > s) __ampSpans.push([Math.min(s, e), Math.max(s, e)]);
                        }
                        const __blocking = __ampSpans.length ? oligos.filter(o => {
                            if (!o || __isAmp(o)) return false;
                            if (!Number.isFinite(o.xi) || !Number.isFinite(o.xf)) return false;
                            const oi = Math.min(o.xi, o.xf), of = Math.max(o.xi, o.xf);
                            return __ampSpans.some(sp => oi < sp[1] && of > sp[0]);
                        }) : [];
                        if (__blocking.length > 0) {
                            _ml.push({
                                label: `Remove amplicon-blocking oligos (${__blocking.length})`,
                                click: async () => {
                                    setTimeout(async () => {
                                        graph.pushOntoHistory();
                                        const rm = new Set(__blocking);
                                        selTrack.oligos = (selTrack.oligos ?? []).filter(o => !rm.has(o));
                                        if (graph.wake) graph.wake();
                                    });
                                }
                            });
                        }

                        function showOligoFilterSideMenu(graph, selectedTrack, distinctLimit = 20) {
                            const menuItems = [];
                            const ols = selectedTrack?.oligos ?? [];

                            const toStr = (v) => (v === null || v === undefined ? "" : String(v));
                            const isNonEmpty = (s) => s.trim().length > 0;

                            const removeWhere = (predicate) => {
                                selectedTrack.oligos = selectedTrack.oligos.filter((o) => !predicate(o));
                            };
                            const keepWhere = (predicate) => {
                                selectedTrack.oligos = selectedTrack.oligos.filter((o) => predicate(o));
                            };

                            const parseEnteredToSet = (entered) => {
                                const s = (entered ?? "").toString().trim();
                                if (!s) return new Set();
                                return new Set(
                                    s.split(/[,\s]+/g).map((x) => x.trim()).filter(Boolean)
                                );
                            };

                            function distinctCounts(fieldAccessor) {
                                const counts = new Map();
                                for (const o of ols) {
                                    const vs = toStr(fieldAccessor(o)).trim();
                                    if (!isNonEmpty(vs)) continue;
                                    counts.set(vs, (counts.get(vs) ?? 0) + 1);
                                }
                                return [...counts.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
                            }

                            function makeDistinctValuesFilterMenu(attrLabel, fieldAccessor) {
                                const values = distinctCounts(fieldAccessor);
                                if (values.length === 0 || values.length >= distinctLimit) return null;

                                const submenu = values.map(([valueStr, count]) => ({
                                    label: `${valueStr} (${count})`,
                                    click: async () => {
                                        const ssubmenu = [
                                            {
                                                label: `Keep only`,
                                                click: () => {
                                                    keepWhere((o) => toStr(fieldAccessor(o)).trim() === valueStr);
                                                    graph.showSideMenu(null);
                                                }
                                            },
                                            {
                                                label: `Remove`,
                                                click: () => {
                                                    removeWhere((o) => toStr(fieldAccessor(o)).trim() === valueStr);
                                                    graph.showSideMenu(null);
                                                }
                                            }
                                        ];
                                        showSideMenuDelayed(ssubmenu);
                                    }
                                }));

                                return {
                                    label: `Filter ${attrLabel}`,
                                    click: () => showSideMenuDelayed(submenu)
                                };
                            }

                            function makePromptFilterItem(attrLabel, promptTitle, promptFieldLabel, fieldAccessor) {
                                const first = ols[0] ?? {};
                                const defaultValue = fieldAccessor(first);

                                return {
                                    label: `Filter ${attrLabel}…`,
                                    click: async () => {
                                        const res = await prompt(
                                            promptTitle,
                                            [promptFieldLabel],
                                            { [promptFieldLabel]: toStr(defaultValue) },
                                            600,
                                            300
                                        );
                                        const entered = res?.[promptFieldLabel];
                                        const enteredSet = parseEnteredToSet(entered);
                                        if (enteredSet.size === 0) return;

                                        removeWhere((o) => {
                                            const vs = toStr(fieldAccessor(o)).trim();
                                            if (!isNonEmpty(vs)) return false;
                                            return enteredSet.has(vs);
                                        });
                                    }
                                };
                            }

                            function addAttribute(attrLabel, promptTitle, promptFieldLabel, fieldAccessor) {
                                const distinctMenu = makeDistinctValuesFilterMenu(attrLabel, fieldAccessor);
                                if (distinctMenu) menuItems.push(distinctMenu);
                                else menuItems.push(makePromptFilterItem(attrLabel, promptTitle, promptFieldLabel, fieldAccessor));
                            }

                            // --- export helpers ---
                            const isSirna = (o) => o?.type === 'sirna';

                            const exportRows = (label, accessor) => ({
                                label,
                                click: async () => {
                                    const rows = ols
                                        .map((o, i) => ({
                                            index: i + 1,
                                            name: toStr(o?.name),
                                            id: toStr(o?.id),
                                            type: toStr(o?.type),
                                            value: toStr(accessor(o)).trim()
                                        }))
                                        .filter((r) => isNonEmpty(r.value));

                                    if (rows.length === 0) return;

                                    const text = rows
                                        .map((r) => [r.name, r.id, r.type, r.value].join('\t'))
                                        .join('\n');

                                    // Prefer your app's copy/download utility if you have one.
                                    if (navigator?.clipboard?.writeText) {
                                        await navigator.clipboard.writeText(text);
                                    } else {
                                        console.log(text);
                                    }
                                }
                            });

                            const hasSirna = ols.some(isSirna);

                            menuItems.push({ type: "separator" });

                            addAttribute("name", "Name", "Name", (o) => o.name);
                            addAttribute("id", "ID", "ID", (o) => o.id);
                            addAttribute("type", "Type", "Type", (o) => o.type);
                            addAttribute("strand", "Strand", "Strand", (o) => o.strand);
                            addAttribute("sequence", "Sequence", "Sequence", (o) => o.sequence);

                            menuItems.push({
                                label: 'Export',
                                click: async () => {
                                    const submenu = [];

                                    const hasAny = (accessor) =>
                                        ols.some(o => isNonEmpty(toStr(accessor(o)).trim()));

                                    const maybeAdd = (label, accessor) => {
                                        if (!hasAny(accessor)) return;

                                        submenu.push({
                                            label,
                                            click: async () => {
                                                const rows = ols
                                                    .map(o => {
                                                        const value = toStr(accessor(o)).trim();
                                                        if (!isNonEmpty(value)) return null;

                                                        return {
                                                            name: toStr(o.name).trim(),
                                                            id: toStr(o.id).trim(),
                                                            value
                                                        };
                                                    })
                                                    .filter(Boolean);

                                                if (rows.length === 0) return;

                                                // Copy to clipboard as tab-delimited text
                                                const text = rows
                                                    .map(r => [r.name, r.id, r.value].join('\t'))
                                                    .join('\n');

                                                if (navigator?.clipboard?.writeText) {
                                                    try {
                                                        await navigator.clipboard.writeText(text);
                                                    } catch (err) {
                                                        console.warn('Clipboard copy failed:', err);
                                                    }
                                                } else {
                                                    console.log(text);
                                                }

                                                // Download as CSV
                                                const escapeCsv = (value) => {
                                                    const s = toStr(value);
                                                    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                                                };

                                                const csvLines = [
                                                    ['name', 'id', label].map(escapeCsv).join(','),
                                                    ...rows.map(r => [r.name, r.id, r.value].map(escapeCsv).join(','))
                                                ];

                                                const blob = new Blob([csvLines.join('\n')], {
                                                    type: 'text/csv;charset=utf-8;'
                                                });
                                                const url = URL.createObjectURL(blob);

                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `${label.toLowerCase().replace(/\s+/g, '_')}.csv`;
                                                document.body.appendChild(a);
                                                a.click();
                                                document.body.removeChild(a);

                                                URL.revokeObjectURL(url);
                                            }
                                        });
                                    };

                                    maybeAdd('Sequence', (o) => o.sequence);
                                    maybeAdd('Synthesis sequence', (o) => o.synthesisSequence);
                                    maybeAdd('Sense', (o) => o.sense);
                                    maybeAdd('Antisense', (o) => o.antisense);
                                    maybeAdd('Sense duplex', (o) => o.senseDuplex);
                                    maybeAdd('Antisense duplex', (o) => o.antisenseDuplex);
                                    maybeAdd('Sense overhang', (o) => o.senseOverhang);
                                    maybeAdd('Antisense overhang', (o) => o.antisenseOverhang);
                                    maybeAdd('Target site', (o) => o.target_site || o.targetSiteRna);
                                    maybeAdd('Sense core RNA', (o) => o.senseCoreRna);
                                    maybeAdd('Antisense core RNA', (o) => o.antisenseCoreRna);

                                    maybeAdd('Seed', (o) => {
                                        const src = toStr(o.seed || o.antisenseCoreRna || o.antisense || '').trim();
                                        return src.length >= 8 ? src.slice(1, 8) : '';
                                    });

                                    if (submenu.length === 0) return;

                                    showSideMenuDelayed(submenu);
                                }
                            });

                            menuItems.push({
                                label: 'Remove all',
                                click: async () => {
                                    let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to delete this?', async () => {
                                        try { graph.pushOntoHistory(); } catch (e) { }   // Ctrl+Z restores
                                        selectedTrack.oligos = [];
                                    });
                                    showModal(confirm);
                                }
                            });

                            if (__menuAllowedOnTap()) showSideMenuDelayed(menuItems);
                        }

                        showOligoFilterSideMenu(graph, selTrack, 20);
                    }
                }
            ];
            return t;
        };

        // Expose the object-specific menu builders so the selection window (gene.js)
        // can attach these exact items under each object-type section, instead of
        // popping the menu up from hover.
        try {
            graph.__getAmpliconMenuItems = getAmpliconMenuItems;
            graph.__getOligoMenuItems = getOligoMenuItems;
            graph.__showOneAmpliconMenu = showOneAmpliconMenu;
        } catch (e) { }

        const getSNPMenuItems = (selectedTrack, graph) => {
            let t = [
                {
                    label: 'SNPs',
                    click: () => {
                        const _ml = []
                        const selTrack = selectedTrack
                        _ml.push({
                            label: selTrack.showSnpIndels ? 'Hide SNPs' : 'Show SNPs',
                            click: async () => {
                                selTrack.showSnpIndels = !selTrack.showSnpIndels
                            }
                        })
                        const gwcxs = graph.Xwc(0);
                        if (gwcxs == null) return;
                        const gwcxf = graph.Xwc(graph.grid?.width ?? 0);
                        if (gwcxf == null) return;
                        const tg = selectedTrack?.tgraph;
                        const twcxs = tg.Xwc(gwcxs - 2 * tg.xi);
                        const twcxf = tg.Xwc(gwcxf - 2 * tg.xi);
                        if (twcxs == null || twcxf == null) return;
                        const snpsv = selectedTrack.getVisibleSNPs(twcxs, twcxf);
                        if (snpsv && snpsv.length > 0) {
                            ml.push({
                                label: 'Mutate (visible) snps',
                                click: async () => {

                                    graph.pushOntoHistory();


                                    setTimeout(async () => {
                                        graph.pushOntoHistory()
                                        for (let snp of snpsv) {
                                            selectedTrack.resolveSNP(snp)
                                        }
                                    })
                                }
                            },
                                {
                                    label: '',
                                    click: async () => {
                                        setTimeout(async () => {
                                            graph.pushOntoHistory()
                                            for (let snp of snpsv) {
                                                selectedTrack.resolveSNP(snp)
                                            }
                                        })
                                    }
                                })
                        }

                        function showSnpIndelFilterSideMenu(graph, selectedTrack, distinctLimit = 20) {
                            const menuItems = [];
                            const snps = selectedTrack?.snpindels ?? [];

                            const toStr = (v) => (v === null || v === undefined ? "" : String(v));
                            const isNonEmpty = (s) => s.trim().length > 0;

                            const removeWhere = (predicate) => {
                                selectedTrack.snpindels = selectedTrack.snpindels.filter((s) => !predicate(s));
                            };
                            const keepWhere = (predicate) => {
                                selectedTrack.snpindels = selectedTrack.snpindels.filter((s) => predicate(s));
                            };

                            const parseEnteredToSet = (entered) => {
                                const s = (entered ?? "").toString().trim();
                                if (!s) return new Set();
                                return new Set(
                                    s
                                        .split(/[,\s]+/g)
                                        .map((x) => x.trim())
                                        .filter(Boolean)
                                );
                            };

                            function distinctCounts(fieldAccessor) {
                                const counts = new Map();
                                for (const s of snps) {
                                    const vs = toStr(fieldAccessor(s)).trim();
                                    if (!isNonEmpty(vs)) continue;
                                    counts.set(vs, (counts.get(vs) ?? 0) + 1);
                                }

                                return [...counts.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
                            }

                            function makeDistinctValuesFilterMenu(attrLabel, fieldAccessor) {
                                const values = distinctCounts(fieldAccessor);

                                if (values.length === 0 || values.length >= distinctLimit) return null;
                                const submenu = values.map(([valueStr, count]) => ({
                                    label: `${valueStr} (${count})`,
                                    click: async () => {
                                        const ssubmenu = [
                                            {
                                                label: `Keep only`,
                                                click: () => {
                                                    keepWhere((s) => toStr(fieldAccessor(s)).trim() === valueStr);
                                                    graph.showSideMenu(null)

                                                },
                                            },
                                            {
                                                label: `Remove`,
                                                click: () => {
                                                    removeWhere((s) => toStr(fieldAccessor(s)).trim() === valueStr);
                                                    graph.showSideMenu(null)

                                                },
                                            },
                                        ]
                                        showSideMenuDelayed(ssubmenu)
                                    }
                                }));

                                return {
                                    label: `Filter ${attrLabel}`,
                                    click: () => {
                                        showSideMenuDelayed(submenu)
                                    }
                                };
                            }

                            function makePromptFilterItem(attrLabel, promptTitle, promptFieldLabel, fieldAccessor) {
                                const first = snps[0] ?? {};
                                const defaultValue = fieldAccessor(first);

                                return {
                                    label: `Filter ${attrLabel}…`,
                                    click: async () => {
                                        const res = await prompt(
                                            promptTitle,
                                            [promptFieldLabel],
                                            { [promptFieldLabel]: toStr(defaultValue) },
                                            600,
                                            300
                                        );

                                        const entered = res?.[promptFieldLabel];
                                        const enteredSet = parseEnteredToSet(entered);
                                        if (enteredSet.size === 0) return;

                                        removeWhere((s) => {
                                            const vs = toStr(fieldAccessor(s)).trim();
                                            if (!isNonEmpty(vs)) return false;
                                            return enteredSet.has(vs);
                                        });
                                    },
                                };
                            }

                            function addAttribute(attrLabel, promptTitle, promptFieldLabel, fieldAccessor) {
                                const distinctMenu = makeDistinctValuesFilterMenu(attrLabel, fieldAccessor);
                                if (distinctMenu) menuItems.push(distinctMenu);
                                else menuItems.push(makePromptFilterItem(attrLabel, promptTitle, promptFieldLabel, fieldAccessor));
                            }

                            menuItems.push({ type: "separator" });

                            addAttribute("phaseset", "Phaseset ID", "Phaseset ID", (s) => s.phaseset);
                            addAttribute("type", "Variant type", "Type", (s) => s.type);
                            addAttribute("strand", "Strand", "Strand", (s) => s.strand);
                            addAttribute("transcriptStrand", "Transcript strand", "Transcript strand", (s) => s.transcriptStrand);
                            addAttribute("phase", "Phase", "Phase", (s) => s.phase);

                            addAttribute("clinsig", "Clinical significance", "ClinSig", (s) => s.clinsig);
                            addAttribute("clindn", "ClinDN", "ClinDN", (s) => s.clindn);

                            addAttribute("reference", "Reference allele", "Reference", (s) => s.reference);
                            addAttribute("alternate", "Alternate allele", "Alternate", (s) => s.alternate);
                            addAttribute("reference0", "Reference0 allele", "Reference0", (s) => s.reference0);
                            addAttribute("alternate0", "Alternate0 allele", "Alternate0", (s) => s.alternate0);

                            addAttribute("color", "Color", "Color", (s) => s.color);
                            addAttribute("highlight", "Highlight (true/false)", "Highlight", (s) => s.highlight);

                            addAttribute("name", "Variant name", "Name", (s) => s.name);
                            addAttribute("id", "Variant ID", "ID", (s) => s.id);
                            addAttribute("quality", "Quality", "Quality", (s) => s.quality);
                            addAttribute("structure", "Structure", "Structure", (s) => s.structure);

                            menuItems.push(
                                {
                                    label: 'Remove all',
                                    click: async () => {
                                        let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to delete this?', async () => {
                                            try { graph.pushOntoHistory(); } catch (e) { }   // Ctrl+Z restores
                                            selectedTrack.snpindels = []
                                        })
                                        showModal(confirm)
                                    }
                                })


                            if (__menuAllowedOnTap()) showSideMenuDelayed(menuItems);
                        }

                        showSnpIndelFilterSideMenu(graph, selectedTrack, 20);

                    }

                }
            ]
            return t;
        }

        let resize = (plot) => {
            plot.highlight();

            graph.selectOff();
            let resize_it = false;
            xi = 0;
            yi = 0
            let origWidth = 0;
            let diffx = 0
            graph.addMouseDownListener(async (x, y) => {
                xi = x;
                yi = y;
                origWidth = graph.screenWidth(plot.w);

                if (plot.inside(graph, graph.X(x), graph.Y(y))) {
                    plot.highlight();
                }

                if (plot.inResize(graph.X(x), graph.Y(y))) {
                    plot.highlight();
                    resize_it = true;

                } else {
                    plot.unhighlight();
                }
            })
            graph.addMouseMoveListener((x, y) => {
                if (resize_it) {

                    diffx = yi - y
                    let h = graph.worldHeight(origWidth) + (diffx)
                    plot.h = h;
                }
            });
            graph.addMouseUpListener((x, y) => {
                resize_it = false;
                plot.unhighlight();
                graph.setMouseMode('navigate')

            })
        }
        let currentWorkbench = null;

        let smenu;

        let dragnavigate = async () => {
            mouse_down = false;
            draw = null;
            menuManager = null;
            smenu = null;
            console.log(" drag ")
            mouseUpListener = (x, y) => {
                px = 0;
                py = 0;
                md = false;
            }

            mouseDownListener = (x, y) => {
                md = true;

            }
            mouseMoveListener = (scx, scy) => {
                md = mouse_down;

                if (md) {
                    if (px === 0) {
                        px = graph.pt.grid.Xwc(scx);
                        py = graph.pt.grid.Ywc(scy);
                    }
                    else {
                        let xd = px - graph.pt.grid.Xwc(scx);
                        let yd = py - graph.pt.grid.Ywc(scy);

                        graph.pt.grid.setxmin(graph.pt.grid.getxmin() + xd);
                        graph.pt.grid.setymin(graph.pt.grid.getymin() + yd);
                        graph.pt.grid.setxmax(graph.pt.grid.getxmax() + xd);
                        graph.pt.grid.setymax(graph.pt.grid.getymax() + yd);
                        graph.pt.grid.rescale();
                    }
                }
            }
        }
        let wb = (wbset) => {
            if (!wbset) {

                if (currentWorkbench != null && currentWorkbench.close) {
                    currentWorkbench.close();
                }

                currentWorkbench = null;
                smenu = null;
                mouseMoveListener = null;
                mouseUpListener = null;
                mouseDownListener = null;
                draw = null;
                menuManager = null;
                keydown = null;
                dragnavigate();
                return;
            } else {
                if (currentWorkbench && currentWorkbench.id && currentWorkbench.id === wbset.id) {
                    return;

                } else {
                    if (currentWorkbench != null && currentWorkbench.close) {
                        currentWorkbench.close();
                    }
                    currentWorkbench = wbset;
                }
                if (wbset.buttons) {
                    panel.setButtons(wbset.buttons)
                }
                if (wbset.msg) {
                    message = wbset.msg;
                    setTimeout(() => {
                        message = null;

                    }, 5000)
                }
                smenu = wbset.smenu;
                mouseMoveListener = wbset.mouseMoveListener;
                mouseUpListener = wbset.mouseUpListener;
                mouseDownListener = wbset.mouseDownListener;
                draw = wbset.draw;
                menuManager = wbset.menuManager;
            }
        }

        if (graph.pt) {
            graph.pt.setWorkbench(wb);
        }

        dragnavigate();

        let default_keydownListener = async (event) => {
            if (event.key === 'ArrowLeft') {
                console.log('Left arrow pressed');
            } else if (event.key === 'ArrowRight') {
                console.log('Right arrow pressed');
            } else if (event.key === 'Enter') {
                console.log('Enter key pressed');
            }
            if (currentWorkbench && currentWorkbench.keydown) {
                return currentWorkbench.keydown(event)
            }
        }
        let getObject = (mmx, mmy) => {
            let p = graph.pt.getPlate(mmx, mmy);
            let scx = graph.pt.grid.X(mmx);
            let scy = graph.pt.grid.Y(mmy)
            if (p != null) {
                return p;
            }
            for (let connection of graph.pt.connections) {
                if (connection.isOnCircle((scx), (scy), graph.pt.grid)) {
                    if (connection != null) {
                        return connection;
                    }
                } if (connection.isOnTriangle(scx, scy, graph.pt.grid)) {
                    if (connection != null) {
                        return connection;
                    }
                }
            }
            let l = graph.pt.getPlot(mmx, mmy)
            if (l != null) {
                return l;

            }
            return null;
        }

        let current = null;
        graph.addMouseMoveListener(async (scx, scy) => {
            let x = scx;
            let y = scy;
            graph.mousex = scx;
            graph.mousey = scy;
            // Vertical oligo drag: while an oligo is being dragged (started on a
            // mouse-down over it), move it in Y only, keep the pan suppressed, and
            // skip hover handling. X is never changed, so it only moves vertically.
            if (graph.__oligoDrag) {
                const d = graph.__oligoDrag;
                try {
                    const tg = d.track.tgraph;
                    if (!d.pushed) { try { graph.pushOntoHistory(); } catch (e) { } d.pushed = true; }
                    let ny = d.startY + (tg.Ywc(scy) - tg.Ywc(d.downY));
                    // Clamp within the track's vertical extent so the oligo never
                    // leaves the top of the track or drops past its bottom.
                    const lo = (typeof tg.ymin === 'number') ? tg.ymin : 0;
                    const hi = (typeof tg.ymax === 'number') ? tg.ymax : 1;
                    const m = Math.min(0.02, (hi - lo) * 0.05);   // small edge margin
                    d.o.y = Math.max(lo + m, Math.min(hi - m, ny));
                    d.moved = true;
                    if (graph.graph) graph.graph.mode = 'move';   // keep the canvas from panning
                    if (graph.wake) graph.wake();
                } catch (e) { }
                return;
            }
            // While a menu is open, freeze hover behavior — don't let it select or
            // deselect tracks / annotations under the cursor, so the user's current
            // selection stays put while they interact with the menu.
            if (graph.side_menu || (graph.menuVisible && graph.menuVisible())) return;
            // While the lasso or box-zoom tool is active, suppress hover highlighting
            // entirely — the drag is drawing a selection/zoom box, not hovering items.
            if (graph.graph && (graph.graph.mode === 'lasso' || graph.graph.mode === 'bpx')) return;
            if (currentWorkbench && currentWorkbench.priority && currentWorkbench.mouseMoveListener) {
                return currentWorkbench.mouseMoveListener(scx, scy)
            }
            if (!md) {
                if (smenu) {
                    smenu.mouseMove(graph.pt.grid, mmx, mmy)
                    return;
                }
            }

            if (move) {
                move.x = x + diffx;
                move.y = y + diffy
            }
            for (let pl of graph.plots) {
                if (pl.inside(graph, x, y)) {
                    move = pl;
                }
            }
            if (!graph.highlight_features)
                for (let t of graph.track) {
                    for (let o of t.oligos) {
                        o.highlight__ = false
                    }
                }

            graph.highlightTrackCoords(x, y);
            let oligos = graph.getStructure(x, y);
            if (oligos && oligos.length) {
                for (let oligo of oligos) {
                    if (oligo && oligo.length > 0) {
                        for (let o of oligo) {
                            if (o.highlight != null && o.structure != null) {
                                try {
                                    current = o;
                                    o.highlight(1000, 'purple')
                                    if (o.id)
                                        graph.setMessage(o.id)
                                    if (graph.highlight)
                                        graph.highlight(o.id, -1, 'gray')
                                } catch (ecx) {

                                }
                            }
                        }

                    }
                }
            }

            for (let plot of graph.plots) {
                if (plot.grid && isPointInRectangle(graph.X(x), graph.Y(y), plot.grid.xi, plot.grid.yi, plot.grid.width, plot.grid.height)) {
                    plot.highlight();
                } else {
                    plot.unhighlight();
                }
            }

            let selectedtrackIndex = graph.getTrack(Math.floor(x), y);
            graph.mouse_message = null;      // cleared each move; re-set below when over a track
            graph.__hoverCoordStr = null;    // info-panel coord row: only shown when over a track
            if (graph.wake) graph.wake();    // force a redraw so the coord/tooltip update live

            // SNP hover/selection — run ALWAYS, not only when the cursor is over a track: a
            // lollipop stem/head can overhang past the top/bottom/end of its track, and
            // getSNPs() hit-tests each SNP's screen region (which spans the whole lollipop),
            // so the overhang stays selectable. Clear prior SNP highlights, then hit-test.
            try {
                for (let t of graph.track) { for (let s of (t.snpindels || [])) if (s) s.highlight = false; }
                let hoverSnps = graph.getSNPs(x, y);
                if (hoverSnps && hoverSnps.length) {
                    let smsg = '';
                    for (let snp of hoverSnps) {
                        if (!snp) continue;
                        snp.highlight = true;
                        if (snp.clinsig) smsg += '[ ' + snp.id + ' ' + snp.type + '=' + snp.clinsig + (snp.clindn ? ' ' + snp.clindn : '') + ' ]  ';
                        else if (snp.clindn) smsg += '[ ' + snp.id + ' ' + snp.type + '=' + snp.clindn + ' ]  ';
                    }
                    if (smsg) graph.setMessage(smsg);
                }
            } catch (e) { }

            if (selectedtrackIndex != null && selectedtrackIndex >= 0) {
                let selectedTrack = graph.track[selectedtrackIndex]
                selectedTrack.select();
                let screencell = Math.abs(graph.screenWidth(selectedTrack.tgraph.screenWidth(1)))
                if (screencell > 5) {

                    if (selectedTrack.strand === 1) {
                        graph.setBaseIndex(Math.round(selectedTrack.tgraph.Xwc(x)) + 1)
                    } else {
                        let wc = selectedTrack.tgraph.Xwc(x)
                        graph.setBaseIndex(Math.round(selectedTrack.tgraph.xmax - wc) + 1)
                    }
                    // Sequence coordinate tooltip on the mouse: cDNA (c.) + genomic (g.).
                    try {
                        let idx = Math.round(selectedTrack.tgraph.Xwc(x));
                        if (selectedTrack.sequence) idx = Math.max(0, Math.min(idx, selectedTrack.sequence.length - 1));
                        let cmsg = 'c.' + (idx + 1);
                        if (selectedTrack.genomicAt) {
                            let gpos = selectedTrack.genomicAt(idx);
                            if (gpos != null) cmsg += '   g.' + gpos;
                        }
                        graph.mouse_message = cmsg;
                        graph.__hoverCoordStr = cmsg;   // shown in the info panel below Chem
                    } catch (e) { }
                    // (SNP hover/selection is handled unconditionally above, so it also works
                    // when the lollipop overhangs off the track.)
                }

                let annotations = selectedTrack.annotations;
                if (annotations) {
                    for (let a of annotations) {
                        if (a.inAnnotation(selectedTrack.tgraph.X(x))) {
                            if (a.description)
                                graph.setMessage(a.description)
                            else {
                                graph.setMessage(a.name)
                            }

                        }
                    }
                }

            }

            for (let track of graph.track) {
                let xw = track.tgraph.Xwc(x - track.tgraph.xi * 2);
                let yw = (track.tgraph.Ywc(y - track.tgraph.yi * 2))
                let annotations = track.getAnnotationsInRange(xw - 1, xw + 1);
                for (let str of track.annotations) {
                    str.deselect();
                }
                for (let an of annotations) {
                    if (Math.abs(yw - an.y) < 0.05)
                        an.select();
                }
            }
            for (let track of graph.track) {
                let selected_list = track.getStructure(x, y)
                if (selected_list && selected_list.length > 0) {
                    for (let selected of selected_list) {
                        if (selected.tgraph && selected.tgraph.xi) {
                            let xxww = x - selected.tgraph.xi * 2;
                            let xw = selected.tgraph.Xwc(xxww);
                            let yw = selected.tgraph.Ywc(y - 2 * selected.tgraph?.yi) + 10
                            selected.select(xw, yw)
                        }
                    }
                }
            }
        })
        function isPointInRectangle(px, py, rx, ry, width, height) {
            const withinXBounds = px >= rx && px <= (rx + width);
            const withinYBounds = py >= ry && py <= (ry + height);
            return withinXBounds && withinYBounds;
        }

        graph.addMouseUpListener(async (x, y) => {

            // Finish a vertical oligo drag: restore navigate (panning). If the oligo
            // actually moved, consume this release so no context menu opens; a plain
            // click (no movement) falls through to the normal select/menu behavior.
            if (graph.__oligoDrag) {
                const moved = graph.__oligoDrag.moved;
                graph.__oligoDrag = null;
                if (graph.graph) graph.graph.mode = 'navigate';
                if (graph.wake) graph.wake();
                if (moved) { move = null; return; }
            }

            move = null;

            // The press landed in a menu (flag set on mouse-down), or a menu is
            // still open now — don't deselect anything or open a menu over it.
            if (graph.__downInMenu || graph.side_menu || (graph.menuVisible && graph.menuVisible())) {
                graph.__downInMenu = false;
                return;
            }

            // Box-zoom owns the interaction — no context menu / deselect on its release.
            if (graph.graph && graph.graph.mode === 'bpx') return;

            // Mouse-down already opened a menu (e.g. the SNP menu) for this
            // press — don't let mouse-up override it with a track/context menu.
            if (graph.__downMenuHandled) {
                graph.__downMenuHandled = false;
                return;
            }

            await showContextMenu(x, y);
            if (!graph.menuVisible()) {
                let t = graph.getTrack(x, y);
                if (t >= 0) {
                    let track = graph.track[t];
                    if (track) {
                        let xw = track.tgraph.Xwc(x - track.tgraph.xi * 2);
                        let yw = (track.tgraph.Ywc(y - track.tgraph.yi * 2))
                        let annotations = track.getAnnotationsInRange(xw - 1, xw + 1);
                        for (let str of track.annotations) {
                            str.deselect();
                        }
                        const HIT_Y_PX = 10;
                        const mergedMenu = { title: "Annotations", items: [] };
                        for (let an of annotations) {
                            if (!an) continue;
                            const dy = Math.abs(graph.Y(track.tgraph.Y(an.y)) - graph.Y(y));
                            if (dy > HIT_Y_PX) continue;
                            an.select();
                            // Build the annotation's type-specific menu (e.g. an exon
                            // menu) and stash it in the selection box instead of popping
                            // it up here — it's shown from selection box → Annotations.
                            let annMenu = [];
                            try {
                                const mfToken = MenuFactory?.[an.type];
                                if (mfToken) {
                                    const mf = getIon(mfToken);
                                    if (mf) {
                                        const menu = mf(an, track, graph, genegraph_panel_layout, x);
                                        if (Array.isArray(menu)) annMenu = menu;
                                    }
                                }
                            } catch (e) { }
                            try { if (graph.addAnnotationToSelection) graph.addAnnotationToSelection(an, track, annMenu); } catch (e) { }
                        }
                        const xWorld = Math.round(
                            track.tgraph.Xwc(graph.mousex - track.tgraph.xi * 2)
                        );
                        const yScreen = graph.Y(y)
                        const snp = track.getClosestSnpindel2D({
                            xWorld,
                            yScreen,
                            graph,
                            selectedTrack: track,
                            maxDistPx: 12,
                            mode: "both"
                        });
                        if (snp) {
                            snp.select();
                            const m = await exec('baja/manchester/menu/snp-menu', graph, track, snp);
                            let m_ = {
                                label: '' + snp.name, click: () => {
                                    showSideMenuDelayed(m)
                                }
                            }
                            mergedMenu.items.push(m_)
                        }


                        if (mergedMenu && mergedMenu.items && mergedMenu.items.length) {
                            graph.showSideMenu(orderMenu(mergedMenu.items), x, y, ((snp && snp.name) ? ('' + snp.name) : 'Variant') + ' ▸');
                        }
                    }
                }
            }

        })

        // Builds and displays the context menu. This used to live in the
        // mouse-down listener; it now runs on mouse-up so a press+drag no
        // longer pops a menu. Drag/resize initiation stays in mouse-down below.
        let showContextMenu = async (x, y) => {

            // Pressing on a plot handle/tab is handled on mouse-down (resize/move).
            // Here we only need to suppress the context menu in those cases.
            for (let pl of graph.plots) {
                const activeTab = pl.inside(graph, x, y);
                if (pl.inResize(graph.X(x), graph.Y(y))) {
                    return;
                } else
                    if (activeTab) {
                        return;
                    }
            }
            move = null;
            if (current && current.highlight__) {

            }
            let oligos = graph.getStructure(x, y);
            if (oligos && oligos.length) {
                for (let oligo of oligos) {
                    if (oligo && oligo.length > 0) {
                        for (let o of oligo) {
                            if (o.highlight != null && o.structure != null) {
                                try {
                                    current = o;
                                    o.highlight(1000, 'magenta')
                                    // Oligo menu moved to the selection window — add the
                                    // oligo to the selection box instead of popping its
                                    // per-oligo (ASO) menu here.
                                    try {
                                        const otrack = (graph.track || []).find(t => t.oligos && t.oligos.indexOf(o) >= 0);
                                        if (graph.addOligoToSelection) graph.addOligoToSelection(o, otrack);
                                    } catch (e) { }
                                    md = false;
                                    return;

                                } catch (ecx) {
                                }
                            }
                        }

                    }
                }
            }

            // --- Shapes (free drawings held in graph.shapes) ---
            // getStructure(x, y) already hit-tests graph.shapes via sh.isIn and
            // returns matching shapes alongside oligos (oligos come back as arrays,
            // shapes as individual objects). Open a context menu for any shape under
            // the cursor. This is an initial context menu, so it opens immediately;
            // its own sub-menus use the deferred helper like everywhere else.
            {
                const hitShapes = (graph.getStructure(x, y) || [])
                    .filter(g => g && !Array.isArray(g) && typeof g.isIn === 'function');

                if (hitShapes.length > 0) {
                    const COLORS = ['red', 'blue', 'green', 'orange', 'purple', 'black', 'gray', 'white'];
                    const shapeMenu = [];

                    for (const sh of hitShapes) {
                        const title = sh.name || sh.type || 'Shape';

                        shapeMenu.push({
                            label: `Edit comment: ${title}`,
                            click: async () => {
                                graph.currentShape = sh;
                                const res = await prompt('Comment', ['Comment'], { Comment: sh.comment || '' }, 500, 300);
                                if (res && res.Comment != null) sh.comment = res.Comment;
                                graph.showSideMenu(null);
                            }
                        });

                        shapeMenu.push({
                            label: `Color: ${title}`,
                            click: () => {
                                const colorSub = COLORS.map(c => ({
                                    label: c,
                                    click: () => {
                                        if (typeof sh.setColor === 'function') sh.setColor(c);
                                        else sh.color = c;
                                        graph.showSideMenu(null);
                                    }
                                }));
                                showSideMenuDelayed(colorSub);
                            }
                        });

                        shapeMenu.push({
                            label: `Delete: ${title}`,
                            click: async () => {
                                let confirm = await exec('baja/lib/confirm.js', 'Delete this shape?', async () => {
                                    graph.currentShape = null;
                                    graph.removeShape(sh);
                                    graph.showSideMenu(null);
                                });
                                showModal(confirm);
                            }
                        });

                        if (hitShapes.length > 1) shapeMenu.push({ type: 'separator' });
                    }

                    graph.showSideMenu(orderMenu(shapeMenu), x, y, 'Shape ▸');
                    return;
                }
            }

            let t = graph.getTrack(x, y);
            if (t >= 0) {
                let track = graph.track[t];
                if (track) {

                    // Preserve the sequence the user just highlighted on THIS
                    // track. deselectAllTracks() clears markstart/markend on every
                    // track (to -1), which would drop the drag selection on mouse
                    // up before the code below can use it. Snapshot and restore.
                    const _preMarkStart = track.markstart;
                    const _preMarkEnd = track.markend;

                    // if (!graph.currentShape)
                    //     graph.deselectAllTracks();

                    track.markstart = _preMarkStart;
                    track.markend = _preMarkEnd;


                    if (track.getHighlightedSequence && track.getHighlightedSequence() != null && track.getHighlightedSequence().length > 0) {




                        let xw = track.tgraph.Xwc(x - track.tgraph.xi * 2);
                        const selectedTrack = track;

                        if (xw >= track.markstart && xw <= track.markend) {
                            md = false;

                            let ml = [
                                {
                                    'label': 'Edit sequence', click: (async () => {
                                        setTimeout(async () => {
                                            graph.setMouseMode('none')
                                            for (let selectedTrack of graph.track) {
                                                if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                                                    exec('baja/manchester/menu/edit-track-sequence-panel.js', selectedTrack, graph, genegraph_panel_layout)
                                                } si
                                            }
                                        }, 100)

                                    })
                                },
                                {
                                    'label': 'Deselect', click: (async () => {
                                        setTimeout(async () => {
                                            graph.setMouseMode('none')
                                            for (let selectedTrack of graph.track) {
                                                selectedTrack.deselect();
                                            }
                                        }, 100)

                                    })
                                },
                                {
                                    'label': 'Sequence Details', click: (async () => {
                                        setTimeout(async () => {
                                            graph.setMouseMode('none')
                                            for (let selectedTrack of graph.track) {
                                                if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                                                    exec('baja/manchester/menu/show-selected-sequence-details.js', selectedTrack, graph, genegraph_panel_layout)
                                                }
                                            }
                                        }, 100)

                                    })
                                },

                                {
                                    'label': 'Run Models', click: (async () => {
                                        setTimeout(async () => {
                                            graph.setMouseMode('none')
                                            const models = [
                                                {
                                                    label: 'Phylon',
                                                    click: async (xwc, ywc) => {
                                                        if (!selectedTrack) {
                                                            graph.setMessage(" No track selected ");
                                                            return;
                                                        }
                                                        graph.showSideMenu(null)
                                                        graph.setMessage(" Running Phylon ")
                                                        graph.setMouseMode("msg: Running Phylon on selected... ")
                                                        for (let selectedTrack of graph.track) {
                                                            if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                                                                graph.setMessageCenter(`Running  ${selectedTrack.markstart} - ${selectedTrack.markend} `)
                                                                let r = await exec('py/splicing/cryptic-exon-finder.py', selectedTrack.getSequenceRange(selectedTrack.markstart, selectedTrack.markend),
                                                                    selectedTrack.chr, selectedTrack.markstart, selectedTrack.markend, selectedTrack.strand)
                                                                if (r && r.status === "file_downloading") {
                                                                    infoPrompt("Model building; this only needs to happen once but may take several minutes")
                                                                    return;
                                                                }
                                                                let cryptic_exons = await exec('baja/bio/splicing/cryptic-exons')
                                                                let g = cryptic_exons.generateCrypticExons(r, { xiAnchor: selectedTrack.markstart })
                                                                for (let cry of g) {
                                                                    selectedTrack.add(cry)
                                                                }
                                                                if (g) {
                                                                    graph.setMessage('Phylon complete. Hits: ' + g.length)
                                                                    graph.setMessage('Phylon complete. Hits: ' + g.length)
                                                                }
                                                            }
                                                        }
                                                        graph.setMouseMode("none")

                                                    }
                                                    ,
                                                    move: () => {
                                                        log('')
                                                    }
                                                },
                                                {
                                                    label: 'Secondary structure',
                                                    click: async (xwc, ywc) => {
                                                        if (!selectedTrack) {
                                                            infoPrompt(" No track selected ");
                                                            return;
                                                        }

                                                        if (selectedTrack != null) {
                                                            let sequence = selectedTrack.getHighlightedSequence();
                                                            if (sequence.length > 7000) {
                                                                infoPrompt(" Sequence is too long for the prediction tool (>7kb)")
                                                                return;
                                                            }

                                                            let lb = null;
                                                            let engineMonitor = new EngineMonitor((msg) => {
                                                                lb.setHTML(msg)
                                                            });
                                                            CurrentLayout.setComponent('buttonMenuPanel', {
                                                                wid: 'html',
                                                                refCallback: createIon((p) => {
                                                                    lb = p
                                                                }),
                                                                data: '<font color="blue"> Generating secondary structure.... </font>'
                                                            });

                                                            let t = await selectedTrack.createSecondaryStructure(selectedTrack.markstart, selectedTrack.getHighlightedSequence(), selectedTrack.name, engineMonitor)
                                                            t.anchorX = selectedTrack.markstart;
                                                            t.xindex_start = selectedTrack.markstart;
                                                            t.tgraph.yi = selectedTrack.tgraph.yi
                                                            t.anchorY = selectedTrack.tgraph.yi;
                                                            setTimeout(async () => {

                                                                graph.setCenterMessage(" Secondary structure is complete ")

                                                            }, 10000)
                                                        } else {
                                                            infoPrompt(" You need to highlight a sequence on a track first.")

                                                        }

                                                    }
                                                    ,
                                                    move: () => {
                                                        log('')
                                                    }
                                                },

                                            ]
                                            showSideMenuDelayed(models)

                                        }, 100)

                                    })
                                }

                                ,
                                {
                                    'label': 'Design by rules (tile & score)', click: (async () => {
                                        // Tile + score oligos by the selected chemistry's rules across the CURRENT
                                        // selection (tile-oligos-design.js requires and restricts to the marked region).
                                        const __runDesignRules = () => { exec('baja/manchester/menu/tile-oligos-design.js', graph, genegraph_panel_layout); };
                                        if (!graph.props.selected_chemistry) {
                                            graph.setMessage('Select a chemistry to design with...');
                                            exec('manchester/choose-chemistry.js', graph, genegraph_panel_layout, () => { __runDesignRules(); });
                                            return;
                                        }
                                        __runDesignRules();
                                    }),
                                    move: () => { log('') }
                                },
                                {
                                    'label': 'Design Assay', click: (async () => {
                                        const lll = [
                                            {
                                                'label': 'Primer-probes', click: (async () => {
                                                    // After choosing "Primer-probes", pick the method:
                                                    //  - primer3: the primer3 python package (generate-ppsets.py),
                                                    //    designed primers placed on the track (apply-primer3.js).
                                                    //  - djPrimer: primer3 design ranked by the assay-success model.
                                                    const runPrimer3 = async () => {
                                                        graph.pushOntoHistory();
                                                        graph.clearMouseListeners();
                                                        for (let selectedTrack of graph.track) {
                                                            if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                                                                let sequence = selectedTrack.getSequenceRange(selectedTrack.markstart, selectedTrack.markend);
                                                                graph.setMessage(' Generating primers (primer3)... ');
                                                                let em = new EngineMonitor((msg) => { try { graph.setMessage(msg); } catch (e) { } });
                                                                let r = await exec('/py/ppsets/generate-ppsets.py', em, '' + sequence, '', 1);
                                                                await exec('baja/manchester/ppsets/apply-primer3.js', r, selectedTrack.markstart - selectedTrack.xi, selectedTrack, graph);
                                                                if (graph.wake) graph.wake();
                                                            }
                                                        }
                                                        // Primers placed — return to mouse-over-highlight + navigate mode.
                                                        graph.setMouseMode('navigate');
                                                        try { graph.clearMouseListeners(); exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
                                                    };
                                                    const runDjprimer = async () => {
                                                        graph.pushOntoHistory();
                                                        graph.clearMouseListeners();
                                                        for (let selectedTrack of graph.track) {
                                                            if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                                                                let sequence = selectedTrack.getSequenceRange(selectedTrack.markstart, selectedTrack.markend);
                                                                const gene = selectedTrack.geneID || selectedTrack.name || '';
                                                                const opts = JSON.stringify({ scorer: 'djprimer', gene: '' + gene });
                                                                graph.setMessage(' Designing primers (djPrimer)... ');
                                                                let r = await exec('py/ppsets/models/find-primer-amplicons.py', '' + sequence, '', '', opts);
                                                                selectedTrack.ampliconResults = r;
                                                                await exec('baja/manchester/ppsets/apply-djprimer.js', r, selectedTrack.markstart - selectedTrack.xi, selectedTrack, graph);
                                                                if (graph.wake) graph.wake();
                                                            }
                                                        }
                                                        // Primers placed — return to mouse-over-highlight + navigate mode.
                                                        graph.setMouseMode('navigate');
                                                        try { graph.clearMouseListeners(); exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
                                                    };
                                                    graph.showSideMenu([
                                                        {
                                                            label: 'primer3', move: () => { },
                                                            click: () => { graph.showSideMenu(null); runPrimer3(); }
                                                        },
                                                        {
                                                            label: 'djPrimer (assay success)', move: () => { },
                                                            click: () => { graph.showSideMenu(null); runDjprimer(); }
                                                        }
                                                    ], null, 'Primer probes ▸');
                                                })
                                            }, {
                                                'label': 'Exon-exon Primer-probes', click: (async () => {
                                                    graph.pushOntoHistory();
                                                    graph.clearMouseListeners();
                                                    for (let selectedTrack of graph.track) {
                                                        if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                                                            const p = 'py/ppsets/models/find-primer-amplicons-exon-exon.py'
                                                            let r = await exec(p, selectedTrack)
                                                            selectedTrack.ampliconResults = r;
                                                            showModal({
                                                                wid: 'json',
                                                                data: JSON.stringify(r)
                                                            })

                                                        }
                                                    }
                                                })
                                            }]
                                        showSideMenuDelayed(lll)
                                    })
                                },
                                {
                                    'label': 'Design Tx', click: (async () => {
                                        const lll = [
                                            {

                                                'label': 'Tile across selected sequence...', click: (async () => {
                                                    if (!graph.props.selected_chemistry) {
                                                        infoPrompt(" Please select a chemistry.")
                                                        return;
                                                    }
                                                    graph.pushOntoHistory()
                                                    setTimeout(async () => {

                                                        // If no sequence is selected yet, enter sequence-selection mode.
                                                        if (!graph.track.some((t) => t.markend > t.markstart)) {
                                                            exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout, true)
                                                            return;
                                                        }
                                                        // A sequence is already selected: prompt with the compound menu
                                                        // options for each selected sequence.
                                                        for (let track of graph.track) {
                                                            if (track.markend > track.markstart) {
                                                                let currentSequence = track.getHighlightedSequence();
                                                                if (graph.props.selected_chemistry === undefined) {
                                                                    graph.setMessage(" No chemistry selected ")
                                                                    return;
                                                                }
                                                                if (currentSequence != null && currentSequence.length > 0) {

                                                                    let menuList = await exec('baja/manchester/menu/compound-menu-list.js', track, graph, genegraph_panel_layout)
                                                                    await showWindowMenuDelayed(menuList, 10, 10, 200);
                                                                }
                                                            }
                                                        }
                                                        // Reset the mouse to normal hover behavior.
                                                        try { graph.clearMouseListeners(); exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }

                                                    }, 100)
                                                })

                                            },
                                            {

                                                'label': 'Tile on secondary structure', click: (async () => {

                                                    if (!graph.props.selected_chemistry) {
                                                        infoPrompt(" Please select a chemistry... [Tools][Chemistry]")
                                                        return;
                                                    }
                                                    graph.pushOntoHistory()
                                                    graph.clearMouseListeners();

                                                    graph.addMouseUpListener(async (x, y) => {

                                                        let trackIndex = graph.getTrack(x, y);
                                                        if (trackIndex >= 0) {
                                                            selectedTrack = graph.track[trackIndex]
                                                            if (selectedTrack) {
                                                                selectedTrack.select();

                                                                selectedTrack.markstart = selectedTrack.tgraph.xmin;
                                                                selectedTrack.markend = selectedTrack.tgraph.xmax;
                                                            }
                                                        }
                                                        if (!graph.props.selected_chemistry) {
                                                            infoPrompt(" Please select a chemistry... [Tools][Chemistry]")
                                                            return;
                                                        }
                                                        let Biopolymer = await exec('baja/chem/biopolymer.js')
                                                        let progressBar;
                                                        let w = {
                                                            wid: 'progress',
                                                            componentRef: 'progressBar',
                                                            data: {
                                                                'progress': 10,
                                                                'progressBar': createIonFunction((progessBar) => {
                                                                    progressBar = progessBar;
                                                                })
                                                            }
                                                        }
                                                        let selseq = []
                                                        for (let selectedTrack of graph.track) {
                                                            let selected_sequence = selectedTrack.getHighlightedSequence();
                                                            if (selected_sequence != null && selected_sequence.length > 0) {
                                                                selseq.push(selected_sequence);
                                                            }
                                                        }
                                                        if (selseq.length <= 0) {
                                                            console.log('debubg');
                                                            graph.setMessage(" Select a sequence on a track first.")
                                                            await exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout, false)
                                                            infoPrompt("Please select a sequence on a track first")
                                                            return;
                                                        }

                                                        let threshold = 0.70
                                                        let va = await prompt("Threshold", ["Threshold"], { "Threshold": threshold }, 300, 300)
                                                        let m = va['Threshold']
                                                        if (m === null) {
                                                            threshold = 0.75
                                                        } else {
                                                            threshold = parseFloat(m);
                                                        }

                                                        for (let selectedTrack of graph.track) {

                                                            let sequence = selectedTrack.getHighlightedSequence();
                                                            let xi = selectedTrack.markstart - selectedTrack.tgraph.xi

                                                            let seqLength = selectedTrack.sequence.length;
                                                            let seq = selectedTrack.getHighlightedSequence();
                                                            let seqName = selectedTrack.name;
                                                            let selectedTrackstrand = selectedTrack.strand;
                                                            let tgraph = selectedTrack.tgraph;
                                                            if (sequence != null && sequence.length > 0) {

                                                                let engineMonitor = new EngineMonitor((msg) => {

                                                                })
                                                                let t = await selectedTrack.createSecondaryStructure(xi, sequence, selectedTrack.name, engineMonitor)
                                                                t.anchorX = selectedTrack.markstart;
                                                                t.xindex_start = selectedTrack.markstart;
                                                                t.tgraph.yi = selectedTrack.tgraph.yi
                                                                t.anchorY = selectedTrack.tgraph.yi;

                                                                setTimeout(async () => {
                                                                    let chemistryObject = graph.props.selected_chemistry;
                                                                    let base_count = Biopolymer.countBases(chemistryObject);
                                                                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                    CurrentLayout.setComponent('buttonMenuPanel', w);
                                                                    let engineMonitor = new EngineMonitor((msg) => {
                                                                    });
                                                                    engineMonitor.addProgressListener(async (v) => {
                                                                        progressBar(v);
                                                                    })

                                                                    function pause(milliseconds) {
                                                                        return new Promise(resolve => setTimeout(resolve, milliseconds));
                                                                    }

                                                                    let r = await exec('py/baja/secondary-structure/energy-window.py', engineMonitor, seq, base_count, threshold);

                                                                    for (let oligo of r['results']) {
                                                                        let bioObject = {
                                                                            'targetSequence': oligo.seq,
                                                                            'trackName': seqName,
                                                                            'startIndex': (selectedTrack.markstart + oligo.pos),
                                                                            'y': (tgraph.ymin),
                                                                            'endIndex': selectedTrack.markstart + oligo.pos + oligo.seq.length,
                                                                            'strand': selectedTrackstrand,
                                                                        }
                                                                        let anno = await Biopolymer.generateCompound(chemistryObject, bioObject)
                                                                        selectedTrack.addOligo(anno)
                                                                        await pause(50);

                                                                    }

                                                                    let w2 = {
                                                                        wid: 'html',
                                                                        data: ` <b> secondary structure opt complete </b>`
                                                                    }

                                                                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                    CurrentLayout.setComponent('buttonMenuPanel', w2);
                                                                    setTimeout(() => {

                                                                        exec('baja/manchester/menu/compound-editor.js', graph, genegraph_panel_layout)

                                                                    }, 1000)

                                                                }, 1000)
                                                            }
                                                        }
                                                    })
                                                })
                                            }]
                                        showSideMenuDelayed(lll)

                                    })
                                }

                            ]

                            // Oligo and amplicon options are no longer shown from hover —
                            // they are attached, grouped by object type, in the selection
                            // window (selection box → Oligos / Amplicons).

                            let annotations_menu = [{
                                'label': 'Annotations', click: (async () => {
                                    setTimeout(async () => {
                                        graph.setMouseMode('none')
                                        let ml = [
                                            {
                                                label: 'Add...',
                                                click: async (scx, scy) => {

                                                    const golist = [
                                                        {
                                                            label: 'Exon',
                                                            click: async (scx, scy) => {
                                                            },
                                                        },
                                                        {
                                                            label: 'Pseudoexon',
                                                            click: async (scx, scy) => {

                                                                setTimeout(async () => {

                                                                    let userInput = await prompt(
                                                                        "Range",
                                                                        ["Range", "Name"],
                                                                        { "Range": "" },
                                                                        600,
                                                                        400
                                                                    );

                                                                    function parseRange(raw) {
                                                                        if (raw == null) throw new Error("Range is required.");
                                                                        let s = String(raw).trim();
                                                                        if (!s) throw new Error("Range is empty.");

                                                                        s = s
                                                                            .replace(/\u2012|\u2013|\u2014|\u2015/g, "-")
                                                                            .replace(/→|⟶|➝|➔|➡/g, "->");

                                                                        if (s.includes(":")) s = s.split(":").pop().trim();

                                                                        s = s.replace(/,/g, "");

                                                                        const delimRegex = /\s*(?:\.\.|-+|:|~|->|=>|→|\bto\b|\bthrough\b|\bthru\b)\s*/i;

                                                                        const parts = s.split(delimRegex).map(x => x.trim()).filter(Boolean);

                                                                        if (parts.length !== 2) {
                                                                            throw new Error(
                                                                                `Could not parse range "${raw}". Examples: "12-34", "12..34", "12 to 34", "chr1:12-34".`
                                                                            );
                                                                        }

                                                                        const start = Number(parts[0]);
                                                                        const end = Number(parts[1]);

                                                                        if (!Number.isFinite(start) || !Number.isFinite(end)) {
                                                                            throw new Error(`Range must contain two numbers. Got: "${parts[0]}", "${parts[1]}".`);
                                                                        }

                                                                        const startIndex = Math.min(start, end);
                                                                        const endIndex = Math.max(start, end);

                                                                        return { startIndex, endIndex };
                                                                    }

                                                                    const { startIndex, endIndex } = parseRange(userInput["Range"]);

                                                                    selectedTrack.add(new Annotation("Exon", "Pseudoexon", startIndex, endIndex));

                                                                }, 1000)

                                                            },
                                                        },

                                                    ]
                                                    showSideMenuDelayed(golist);

                                                },
                                            },
                                            {
                                                label: 'Edit',
                                                click: async (scx, scy) => {

                                                    let annotations = selectedTrack.getAnnotationsInRange(
                                                        selectedTrack.markstart,
                                                        selectedTrack.markend
                                                    )

                                                    const mml = await exec('baja/manchester/menu/annotations-type-menu', graph, genegraph_panel_layout, annotations, selectedTrack)
                                                    showSideMenuDelayed(mml)

                                                },
                                            }

                                        ]

                                        if (selectedTrack.snpindels && selectedTrack.snpindels.length > 0)
                                            ml = ml.concat(getSNPMenuItems(selectedTrack, graph))

                                        let selectedtrackIndex = graph.getTrack(Math.floor(x), y);
                                        if (selectedtrackIndex != null && selectedtrackIndex >= 0) {
                                            let selectedTrack = graph.track[selectedtrackIndex]
                                            if (!selectedTrack.markstart || !selectedTrack.markend || selectedTrack.markstart < 0 || selectedTrack.markend < 0) {
                                                selectedTrack.markstart = selectedTrack.tgraph.xmin;
                                                selectedTrack.markend = selectedTrack.tgraph.xmax;
                                            }

                                            if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                                                for (let selectedTrack of graph.track) {
                                                    let annotations = selectedTrack.getAnnotationsInRange(
                                                        selectedTrack.markstart,
                                                        selectedTrack.markend
                                                    )
                                                    if (annotations && annotations.length > 0) {
                                                        let mml = [
                                                            {
                                                                label: 'Edit type',
                                                                click: () => {

                                                                    let ch = []

                                                                    for (let type of types) {
                                                                        ch.push({
                                                                            label: type,
                                                                            click: () => {

                                                                                const annotationsOfType = annotations.filter(a => a?.type === type)

                                                                                showSideMenuDelayed([
                                                                                    {
                                                                                        label: 'View',
                                                                                        click: () => {
                                                                                            if (selectedTrack.setSelectedAnnotations) {
                                                                                                selectedTrack.setSelectedAnnotations(annotationsOfType)
                                                                                            }
                                                                                        }
                                                                                    },
                                                                                    {
                                                                                        label: 'Copy',
                                                                                        click: async () => {
                                                                                            const json = JSON.stringify(annotationsOfType, null, 2)
                                                                                            if (navigator.clipboard?.writeText) {
                                                                                                await navigator.clipboard.writeText(json)
                                                                                            }
                                                                                        }
                                                                                    },
                                                                                    {
                                                                                        label: 'Remove',
                                                                                        click: () => {
                                                                                            if (selectedTrack.removeAnnotations) {
                                                                                                selectedTrack.removeAnnotations(annotationsOfType)
                                                                                            } else if (selectedTrack.removeAnnotation) {
                                                                                                for (const a of annotationsOfType) {
                                                                                                    selectedTrack.removeAnnotation(a)
                                                                                                }
                                                                                            }
                                                                                            graph.render?.()
                                                                                        }
                                                                                    }
                                                                                ])
                                                                            }
                                                                        })
                                                                    }
                                                                    showSideMenuDelayed(ch)

                                                                }
                                                            },
                                                        ]
                                                        showSideMenuDelayed(mml)

                                                        if (graph.track && graph.track.length === 1) {

                                                            const mml = []
                                                            const selTrack = graph.track[0]
                                                            mml.push({
                                                                label: selTrack.showLayers ? 'Hide Data Layers' : 'Show Data Layers',
                                                                click: async () => {
                                                                    selTrack.showLayers = !selTrack.showLayers
                                                                }
                                                            })

                                                            for (let dl of selTrack.track_layers) {
                                                                mml.push({
                                                                    label: dl.name,
                                                                    click: async () => {
                                                                        let mmml = []
                                                                        mmml.push({
                                                                            label: 'Edit',
                                                                            click: async () => {

                                                                            }
                                                                        })
                                                                        mmml.push({
                                                                            label: 'Delete',
                                                                            click: async () => {

                                                                                const idx = selTrack.track_layers.indexOf(dl)
                                                                                if (idx !== -1) {
                                                                                    selTrack.track_layers.splice(idx, 1)
                                                                                }
                                                                                graph.showSideMenu(null)

                                                                            }
                                                                        })
                                                                        showSideMenuDelayed(mmml)
                                                                    }
                                                                })
                                                            }

                                                            ml.push({
                                                                label: 'Data Layers',
                                                                click: () => {
                                                                    showSideMenuDelayed(mml)
                                                                }
                                                            })
                                                        }

                                                    }
                                                }
                                                showSideMenuDelayed(ml)

                                            }
                                        }
                                    }, 100)

                                })
                            }]

                            // Annotation options moved to the selection window as their
                            // own object type (selection box → Annotations).
                            graph.showSideMenu(orderMenu(mergePendingSnp(ml)), x, y, ((selectedTrack && selectedTrack.name) || 'Track') + ' ▸')
                            return;
                        }
                    } else {
                        let selected = track.getStructure(x, y)

                    }
                }
            } else {
            }
            // SNP selection + snp-menu was moved to the mouse-down listener.

            for (let plot of graph.plots) {
                if (plot.grid && isPointInRectangle(graph.X(x), graph.Y(y), plot.grid.xi, plot.grid.yi, plot.grid.width, plot.grid.height) && plot._highlight && plot.inResize(graph.X(x), graph.Y(y))) {
                    let menuList = [];
                    menuList.push(
                        {
                            label: 'Resize',
                            click: async (scx, scy) => {
                                resize(plot);
                            },
                            move: () => {
                            }
                        });
                    menuList.push(
                        {
                            label: 'Move',
                            click: async (scx, scy) => {
                                graph.setMouseMode("menu")
                                moveit(plot)
                            },
                            move: () => {
                            }
                        });
                    menuList.push(
                        {
                            label: 'Color selected',
                            click: async (scx, scy) => {

                                let selectedPoints = plot.getSelected()

                            },
                            move: () => {
                            }
                        });

                    menuList.push(
                        {
                            label: 'Label',
                            click: async (scx, scy) => {

                                exec('baja/manchester/menu/label-plot-points-by-regular-expression.js', plot)

                            },
                            move: () => {
                            }
                        });

                    menuList.push(
                        {
                            label: 'Hide unhighlighted pts',
                            click: async (scx, scy) => {

                                plot.hideUnhighlighted();
                                graph.setMouseMode('navigate')

                            },
                            move: () => {
                            }
                        });

                    menuList.push(
                        {
                            label: 'Show all pts',
                            click: async (scx, scy) => {

                                plot.showUnhighlighted();
                                graph.setMouseMode('navigate')

                            },
                            move: () => {
                            }
                        });
                    menuList.push(
                        {
                            label: 'Add track layer',
                            click: async (scx, scy) => {
                                graph.setMouseMode('menu')

                                let menuList = [

                                ]
                                for (let t of graph.track) {
                                    menuList.push({
                                        label: `${t.name}`,
                                        click: async () => {

                                            await exec('baja/manchester/menu/cluster-objects-on-tracklayers-plot-panel.js', graph, graph.genegraph_panel_layout, plot, t)
                                        }
                                    })

                                }
                                showWindowMenuDelayed(menuList, 10, 10, 200);
                            },
                            move: () => {
                            }
                        });
                    menuList.push(
                        {
                            label: 'Lasso pts',
                            click: async (scx, scy) => {
                                graph.setMouseMode('menu')
                                await exec('baja/bio/annotation-layer-plot-lasso.js', plot, graph, genegraph_panel_layout)
                            },
                            move: () => {
                            }
                        });

                    menuList.push(
                        {
                            label: 'Delete',
                            click: async (scx, scy) => {
                                graph.setMessage(" Are you sure you want to remove this? ")

                                let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to delete this?', async () => {
                                    console.log('debubg');

                                    const index = graph.plots.indexOf(plot);
                                    if (index !== -1) {
                                        graph.plots.splice(index, 1);
                                    }

                                    graph.setMouseMode('navigate')

                                })
                                showModal(confirm)

                            },
                            move: () => {
                            }
                        });

                    graph.showMenu(menuList, x, y)

                }

            }
            let selectedtrackIndex = graph.getTrack(Math.floor(x), y);
            if (selectedtrackIndex != null && selectedtrackIndex >= 0) {
                let selectedTrack = graph.track[selectedtrackIndex]
                selectedTrack.select();
                md = false;

                let annotations_menu = [{
                    'label': 'Annotations', click: (async () => {
                        setTimeout(async () => {
                            graph.setMouseMode('none')
                            let ml = [
                                {
                                    label: 'Add...',
                                    click: async (scx, scy) => {

                                        const golist = [
                                            {
                                                label: 'Exon',
                                                click: async (scx, scy) => {
                                                },
                                            },
                                            {
                                                label: 'Pseudoexon',
                                                click: async (scx, scy) => {

                                                    setTimeout(async () => {

                                                        let userInput = await prompt(
                                                            "Range",
                                                            ["Range", "Name"],
                                                            { "Range": "" },
                                                            600,
                                                            400
                                                        );

                                                        function parseRange(raw) {
                                                            if (raw == null) throw new Error("Range is required.");
                                                            let s = String(raw).trim();
                                                            if (!s) throw new Error("Range is empty.");

                                                            s = s
                                                                .replace(/\u2012|\u2013|\u2014|\u2015/g, "-")
                                                                .replace(/→|⟶|➝|➔|➡/g, "->");

                                                            if (s.includes(":")) s = s.split(":").pop().trim();

                                                            s = s.replace(/,/g, "");

                                                            const delimRegex = /\s*(?:\.\.|-+|:|~|->|=>|→|\bto\b|\bthrough\b|\bthru\b)\s*/i;

                                                            const parts = s.split(delimRegex).map(x => x.trim()).filter(Boolean);

                                                            if (parts.length !== 2) {
                                                                throw new Error(
                                                                    `Could not parse range "${raw}". Examples: "12-34", "12..34", "12 to 34", "chr1:12-34".`
                                                                );
                                                            }

                                                            const start = Number(parts[0]);
                                                            const end = Number(parts[1]);

                                                            if (!Number.isFinite(start) || !Number.isFinite(end)) {
                                                                throw new Error(`Range must contain two numbers. Got: "${parts[0]}", "${parts[1]}".`);
                                                            }

                                                            const startIndex = Math.min(start, end);
                                                            const endIndex = Math.max(start, end);

                                                            return { startIndex, endIndex };
                                                        }

                                                        const { startIndex, endIndex } = parseRange(userInput["Range"]);

                                                        selectedTrack.add(new Annotation("Exon", "Pseudoexon", startIndex, endIndex));

                                                    }, 1000)

                                                },
                                            },

                                        ]
                                        showSideMenuDelayed(golist);

                                    },
                                },
                                {
                                    label: 'Edit',
                                    click: async (scx, scy) => {

                                        let annotations = selectedTrack.getAnnotationsInRange(
                                            selectedTrack.markstart,
                                            selectedTrack.markend
                                        )

                                        const mml = await exec('baja/manchester/menu/annotations-type-menu', graph, genegraph_panel_layout, annotations, selectedTrack)
                                        showSideMenuDelayed(mml)

                                    },
                                }

                            ]

                            if (selectedTrack.snpindels && selectedTrack.snpindels.length > 0)
                                ml = ml.concat(getSNPMenuItems(selectedTrack, graph))

                            let selectedtrackIndex = graph.getTrack(Math.floor(x), y);
                            if (selectedtrackIndex != null && selectedtrackIndex >= 0) {
                                let selectedTrack = graph.track[selectedtrackIndex]
                                if (!selectedTrack.markstart || !selectedTrack.markend || selectedTrack.markstart < 0 || selectedTrack.markend < 0) {
                                    selectedTrack.markstart = selectedTrack.tgraph.xmin;
                                    selectedTrack.markend = selectedTrack.tgraph.xmax;
                                }

                                if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                                    for (let selectedTrack of graph.track) {
                                        let annotations = selectedTrack.getAnnotationsInRange(
                                            selectedTrack.markstart,
                                            selectedTrack.markend
                                        )
                                        if (annotations && annotations.length > 0) {
                                            let mml = [
                                                {
                                                    label: 'Edit type',
                                                    click: () => {

                                                        let ch = []

                                                        for (let type of types) {
                                                            ch.push({
                                                                label: type,
                                                                click: () => {

                                                                    const annotationsOfType = annotations.filter(a => a?.type === type)

                                                                    showSideMenuDelayed([
                                                                        {
                                                                            label: 'View',
                                                                            click: () => {
                                                                                if (selectedTrack.setSelectedAnnotations) {
                                                                                    selectedTrack.setSelectedAnnotations(annotationsOfType)
                                                                                }
                                                                            }
                                                                        },
                                                                        {
                                                                            label: 'Copy',
                                                                            click: async () => {
                                                                                const json = JSON.stringify(annotationsOfType, null, 2)
                                                                                if (navigator.clipboard?.writeText) {
                                                                                    await navigator.clipboard.writeText(json)
                                                                                }
                                                                            }
                                                                        },
                                                                        {
                                                                            label: 'Remove',
                                                                            click: () => {
                                                                                if (selectedTrack.removeAnnotations) {
                                                                                    selectedTrack.removeAnnotations(annotationsOfType)
                                                                                } else if (selectedTrack.removeAnnotation) {
                                                                                    for (const a of annotationsOfType) {
                                                                                        selectedTrack.removeAnnotation(a)
                                                                                    }
                                                                                }
                                                                                graph.render?.()
                                                                            }
                                                                        }
                                                                    ])
                                                                }
                                                            })
                                                        }
                                                        showSideMenuDelayed(ch)

                                                    }
                                                },
                                            ]
                                            showSideMenuDelayed(mml)

                                            if (graph.track && graph.track.length === 1) {

                                                const mml = []
                                                const selTrack = graph.track[0]
                                                mml.push({
                                                    label: selTrack.showLayers ? 'Hide Data Layers' : 'Show Data Layers',
                                                    click: async () => {
                                                        selTrack.showLayers = !selTrack.showLayers
                                                    }
                                                })

                                                for (let dl of selTrack.track_layers) {
                                                    mml.push({
                                                        label: dl.name,
                                                        click: async () => {
                                                            let mmml = []
                                                            mmml.push({
                                                                label: 'Edit',
                                                                click: async () => {

                                                                }
                                                            })
                                                            mmml.push({
                                                                label: 'Delete',
                                                                click: async () => {

                                                                    const idx = selTrack.track_layers.indexOf(dl)
                                                                    if (idx !== -1) {
                                                                        selTrack.track_layers.splice(idx, 1)
                                                                    }
                                                                    graph.showSideMenu(null)

                                                                }
                                                            })
                                                            showSideMenuDelayed(mmml)
                                                        }
                                                    })
                                                }

                                                ml.push({
                                                    label: 'Data Layers',
                                                    click: () => {
                                                        showSideMenuDelayed(mml)
                                                    }
                                                })
                                            }

                                        }
                                    }
                                    showSideMenuDelayed(ml)

                                }
                            }
                        }, 100)

                    })
                }]


                // --- promoted from the former "Edit track" submenu ---
                const golist = [
                    {
                        label: 'Properties',
                        click: async (scx, scy) => {
                            graph.setMessage("Click on a track to see available edit options. ")
                            await exec('baja/manchester/menu/edit-current-track.js', graph, genegraph_panel_layout, selectedTrack)
                        },
                    },

                    {
                        label: 'Highlight sequence motif',
                        click: async () => {

                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                            setTimeout(async () => {

                                let Annotation = await exec('flexigraph/annotation.js')

                                const buildLPSArray = (pattern) => {
                                    let length = 0;
                                    let lps = [0];
                                    let i = 1;

                                    while (i < pattern.length) {
                                        if (pattern[i] === pattern[length]) {
                                            length++;
                                            lps[i] = length;
                                            i++;
                                        } else {
                                            if (length !== 0) {
                                                length = lps[length - 1];
                                            } else {
                                                lps[i] = 0;
                                                i++;
                                            }
                                        }
                                    }

                                    return lps;
                                }

                                const KMPsearch = (text, pattern) => {
                                    let m = pattern.length;
                                    let n = text.length;
                                    let lps = buildLPSArray(pattern);
                                    let i = 0;
                                    let j = 0;
                                    let results = [];

                                    while (i < n) {
                                        if (pattern[j] === text[i]) {
                                            j++;
                                            i++;
                                        }

                                        if (j === m) {
                                            results.push(i - j);
                                            j = lps[j - 1];
                                        } else if (i < n && pattern[j] !== text[i]) {
                                            if (j !== 0) {
                                                j = lps[j - 1];
                                            } else {
                                                i = i + 1;
                                            }
                                        }
                                    }

                                    return results;
                                }

                                let panel = null;
                                let descHook = createIonFunction((_panel) => {
                                    panel = _panel;
                                })

                                let color = 'magenta'

                                let list = [
                                    {
                                        label: 'Find motif...', click: () => {

                                            let sequence_input = {
                                                wid: 'card',
                                                "height": "500px",
                                                data: {
                                                    "style.padding-top": '1px',
                                                    "style.border": '1px',
                                                    "style.height": "500px",
                                                    cards: [
                                                        [
                                                            {
                                                                'width': '100%',
                                                                'component': {
                                                                    wid: 'html',
                                                                    data: ' Enter a sequence motif'
                                                                }
                                                            },
                                                            {

                                                                'width': '100%',
                                                                'component': {
                                                                    wid: 'card',
                                                                    data: {
                                                                        cards: [
                                                                            [

                                                                                {
                                                                                    'width': '100%',
                                                                                    'height': "100px",
                                                                                    "style.padding-top": '4px',
                                                                                    "style.border": '1px',
                                                                                    'component':
                                                                                    {
                                                                                        'wid': 'color-chooser',
                                                                                        'width': '100%',

                                                                                        "data": {
                                                                                            "selectionListener": createIonFunction((_color) => {
                                                                                                color = _color;
                                                                                            })
                                                                                        }
                                                                                    }
                                                                                },
                                                                            ]
                                                                        ]
                                                                    }
                                                                }

                                                            },

                                                            {
                                                                'width': '100%',
                                                                'component': {
                                                                    wid: 'text-editor',
                                                                    refCallback: descHook,
                                                                    data: {
                                                                        height: "250px",
                                                                        showButton: false,
                                                                        editorOptions: { language: 'text', automaticLayout: true },
                                                                        keybinding: {
                                                                            'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                                            })
                                                                        },
                                                                    }
                                                                }
                                                            },
                                                            {
                                                                'component': {
                                                                    wid: 'mt-button', data: {
                                                                        buttons: [
                                                                            {
                                                                                label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                                    CurrentLayout.reset('mainPanel')
                                                                                })
                                                                            },
                                                                            {
                                                                                label: 'Search all tracks', ionFunction: createIonFunction(async () => {
                                                                                    let motif = panel.getActiveTabContent();
                                                                                    for (let t of graph.track) {
                                                                                        let seq = t.sequence;
                                                                                        let result = KMPsearch(seq, motif)
                                                                                        for (let r of result) {
                                                                                            let annotation = new Annotation("UserAnnotation", '' + r, t.xi + r, t.xi + r + motif.length);
                                                                                            annotation.color = color;
                                                                                            t.add(annotation)
                                                                                        }
                                                                                    }
                                                                                    CurrentLayout.reset('mainPanel');
                                                                                })
                                                                            },
                                                                        ]
                                                                    }
                                                                }
                                                            }
                                                        ]]
                                                }
                                            }

                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', sequence_input);

                                        }
                                    },
                                    {
                                        label: 'Find triplet repeats', click: () => {

                                        }
                                    },
                                    {
                                        label: 'Find quad repeats', click: () => {

                                        }
                                    },
                                ]
                                let names = list.map(obj => obj.label);
                                let t = {
                                    wid: 'selection-list',
                                    data: {
                                        single_selection: true,
                                        show_button: false,
                                        singleSelect: true,
                                        listItems: names,
                                        button_function: createIonFunction(async (items) => {

                                            let name = items[0]
                                            for (let l of list) {
                                                if (l.label === name) {
                                                    l.click()
                                                }
                                            }

                                        })
                                    }
                                }

                                let design_params_panel_layout = {
                                    wid: 'card',
                                    data: {
                                        cards: [
                                            [
                                                {
                                                    'width': '100%',
                                                    'component': t
                                                },
                                                {
                                                    'title': '',
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'mt-button', data: {
                                                            buttons: [
                                                                {
                                                                    label: 'Close', ionFunction: createIonFunction(() => {
                                                                        CurrentLayout.reset('mainPanel')
                                                                    })
                                                                }
                                                            ]
                                                        }
                                                    }
                                                }

                                            ]
                                        ]
                                    }
                                }
                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', design_params_panel_layout);

                            }, 1000);

                        }
                    },
                    // {
                    //     label: 'Protein',
                    //     click: async () => {
                    //         graph.showSideMenu(null)
                    //         let orf = null;
                    //         try { selectedTrack.generateORF(); orf = selectedTrack.getProteinSequence(); } catch (e) { console.warn('protein', e); }
                    //         if (!orf) { graph.setCenterMessage(" This does not appear to create a protein "); return; }
                    //         {
                    //             const protein_list = [
                    //                 {
                    //                     label: 'Peptide sequence',
                    //                     click: async (scx, scy) => {
                    //                         showModal({
                    //                             wid: 'text-editor',
                    //                             data: {
                    //                                 'code': orf
                    //                             }
                    //                         })


                    //                     },
                    //                 },
                    //                 {
                    //                     label: 'Peptide properties',
                    //                     click: async (scx, scy) => {
                    //                         graph.showSideMenu(null)

                    //                         let engineMonitor = new EngineMonitor((msg) => {
                    //                         });
                    //                         let pepseq = await exec('py/bio/protein/properties.py', engineMonitor, orf)
                    //                         showModal({
                    //                             wid: 'text-editor',
                    //                             data: { 'code': (jsonToNameValue(pepseq)) }
                    //                         }, 600, 400)


                    //                     },
                    //                 }
                    //             ]
                    //             showSideMenuDelayed(protein_list)
                    //         }
                    //     }
                    // },
                    {
                        label: 'Layers',
                        click: async () => {
                            graph.showSideMenu(null)

                            const golist = [
                            ];

                            golist.push({
                                label: selectedTrack.showLayers ? 'Hide' : 'Show',
                                click: () => {
                                    selectedTrack.showLayers = !selectedTrack.showLayers;
                                    graph.rescale();
                                }
                            });

                            // Data / Models live HERE — this is the Layers menu that actually
                            // renders (it reaches track_list via ...golist). The other 'Layers'
                            // entry further down is shadowed by this one.
                            golist.push({
                                // Data opens the Data Resources Library directly rather than
                                // expanding a short list of shortcuts into it. The library is the
                                // catalogue; a submenu naming three of its shelves was a second,
                                // narrower index of the same thing. '...' not '▸': it opens a
                                // panel, it is not a submenu.
                                label: 'Data...',
                                move: () => { },
                                click: async () => {
                                    graph.showSideMenu(null);
                                    await exec('baja/data/data-resources-library.js', graph, genegraph_panel_layout, selectedTrack ? [selectedTrack] : []);
                                }
                            });

                            golist.push({
                                // Models opens the ML Models Library rather than listing model
                                // names: the library carries what each one predicts and what it
                                // cannot, which is the part worth reading before running it. The
                                // runners fall back to the SELECTED track when not handed one,
                                // so launching from the library still acts on this track.
                                label: 'Models...',
                                move: () => { },
                                click: async () => {
                                    graph.showSideMenu(null);
                                    // From a TRACK menu: this track is the target, so it is passed in rather than
                                    // left to be guessed from the selection.
                                    await exec('baja/ml/models-library.js', graph, genegraph_panel_layout, selectedTrack ? [selectedTrack] : []);
                                }
                            });

                            graph.showSideMenu(golist, null, "Layers");
                        }
                    },
                    {
                        // Sequence-specific operations for THIS track. Everything here acts on
                        // the current selection (markstart/markend) when there is one and on the
                        // whole track otherwise, so the same item does the obvious thing either
                        // way. Lives on golist because that is the list that actually renders.
                        label: 'Sequence ▸',
                        move: () => { },
                        click: async (scx, scy) => {
                            const t = selectedTrack;
                            const hasSel = !!(t && t.markstart >= 0 && t.markend > t.markstart);
                            const spanLabel = hasSel ? 'selection' : 'whole track';
                            const dna = (x) => ('' + (x || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGTN]/g, '');
                            const seqOf = () => {
                                try {
                                    if (hasSel && t.getSequenceRange) return dna(t.getSequenceRange(t.markstart, t.markend));
                                    return dna(t.sequence);
                                } catch (e) { return ''; }
                            };
                            const copy = async (txt, what) => {
                                try {
                                    if (navigator.clipboard) await navigator.clipboard.writeText(txt);
                                    graph.setMessage(' Copied ' + what + ' (' + txt.length + ' nt). ');
                                } catch (e) { try { graph.setMessage(' Could not copy: ' + e + ' '); } catch (e2) { } }
                            };
                            const revComp = (x) => x.split('').reverse().map((b) => ({ A: 'T', T: 'A', G: 'C', C: 'G' }[b] || 'N')).join('');
                            const go = (label, fn) => ({ label: label, move: () => { }, click: async () => { graph.showSideMenu(null); try { await fn(); } catch (e) { try { graph.setMessage(' ' + label + ' failed: ' + (e && e.message ? e.message : e) + ' '); } catch (e2) { } } } });

                            showSideMenuDelayed([
                                go('Details (' + spanLabel + ')...', async () => exec('baja/manchester/menu/show-selected-sequence-details.js', selectedTrack, graph, genegraph_panel_layout)),
                                go('Select sequence range...', async () => exec('baja/manchester/menu/select-sequence.js', graph, genegraph_panel_layout, true)),
                                go('Selected-sequence tools...', async () => exec('baja/manchester/menu/selected-sequence-tools.js', graph, genegraph_panel_layout, selectedTrack)),
                                go('Find motif...', async () => exec('baja/manchester/menu/motif-tools.js', graph)),
                                go('Translate / ORF...', async () => exec('baja/manchester/menu/translate-track.js', graph)),
                                go('Edit sequence...', async () => exec('baja/manchester/menu/edit-track-sequence.js', graph, genegraph_panel_layout)),
                                go('Mutate from sequence...', async () => exec('baja/manchester/menu/mutation-from-track-sequence.js', graph, genegraph_panel_layout, true)),
                                go('Match exons', async () => exec('baja/manchester/menu/sequence-exons-match.js', graph)),
                                go('Match introns', async () => exec('baja/manchester/menu/sequence-introns-match.js', graph)),
                                go('Copy sequence (' + spanLabel + ')', async () => copy(seqOf(), spanLabel + ' sequence')),
                                go('Copy reverse complement', async () => copy(revComp(seqOf()), 'reverse complement')),
                                go('Composition (GC%)', async () => {
                                    const q = seqOf();
                                    if (!q.length) { graph.setMessage(' No sequence on this track. '); return; }
                                    const gc = (q.match(/[GC]/g) || []).length;
                                    const n = (q.match(/N/g) || []).length;
                                    graph.setMessage(' ' + spanLabel + ': ' + q.length + ' nt — GC ' + ((gc / q.length) * 100).toFixed(1) + '%'
                                        + (n ? (' — ' + n + ' N') : '') + '. ');
                                })
                            ], scx, scy);
                        }
                    }


                ]

                // Compound actions, only when this track HAS compounds -- three dead entries on
                // an empty track is worse than none. They act on every compound on the track,
                // which is what "the compounds" means from a track menu; the per-compound
                // actions live under Compounds ▸.
                try {
                    const __cs = (selectedTrack && Array.isArray(selectedTrack.oligos))
                        ? selectedTrack.oligos.filter(Boolean) : [];
                    if (__cs.length) {
                        golist.push({
                            label: 'Highlight compounds (' + __cs.length + ')',
                            move: () => { },
                            click: () => {
                                try { graph.showSideMenu(null); } catch (e) { }
                                // o.highlight__ is not a boolean: the renderer passes it straight
                                // to drawVerticalLineScreen as the COLOUR. Toggling it is the
                                // twinkle -- a static highlight is easy to miss on a busy track.
                                const MAGENTA = '#ff2fd6';
                                const prev = __cs.map((o) => o.highlight__);
                                let on = false, ticks = 0;
                                const timer = setInterval(() => {
                                    on = !on;
                                    for (const o of __cs) { try { o.highlight__ = on ? MAGENTA : false; } catch (e) { } }
                                    try { if (graph.wake) graph.wake(); } catch (e) { }
                                    if (++ticks >= 12) {
                                        try { clearInterval(timer); } catch (e) { }
                                        // Restore whatever each one had, so this cannot clobber a
                                        // highlight something else set (an off-target run marks
                                        // its hits the same way).
                                        __cs.forEach((o, i) => { try { o.highlight__ = prev[i]; } catch (e) { } });
                                        try { if (graph.wake) graph.wake(); } catch (e) { }
                                    }
                                }, 450);
                                try { graph.setMessage(' Highlighting ' + __cs.length + ' compound' + (__cs.length === 1 ? '' : 's') + '. '); } catch (e) { }
                            }
                        });
                        golist.push({
                            label: 'Zoom compounds',
                            move: () => { },
                            click: () => {
                                try { graph.showSideMenu(null); } catch (e) { }
                                try {
                                    // The union of their spans, so the answer to "where are they"
                                    // is one view rather than a tour.
                                    let lo = Infinity, hi = -Infinity;
                                    for (const o of __cs) {
                                        const a = +o.xi, b = (o.xf != null ? +o.xf : +o.xi);
                                        if (!isFinite(a)) continue;
                                        lo = Math.min(lo, a, isFinite(b) ? b : a);
                                        hi = Math.max(hi, a, isFinite(b) ? b : a);
                                    }
                                    const g = selectedTrack.grid || selectedTrack.tgraph;
                                    if (!g || !isFinite(lo) || !isFinite(hi)) { graph.setMessage(' Those compounds have no coordinates to zoom to. '); return; }
                                    const pad = Math.max(20, (hi - lo) * 0.15);
                                    graph.animateTo(g.X(lo - pad), g.X(hi + pad), g.Y(-1.2), g.Y(1.2));
                                    if (graph.wake) graph.wake();
                                    graph.setMessage(' ' + __cs.length + ' compound' + (__cs.length === 1 ? '' : 's')
                                        + ' — ' + Math.round(lo) + '–' + Math.round(hi) + ' on ' + (selectedTrack.name || 'track') + '. ');
                                } catch (e) { try { graph.setMessage(' Could not navigate: ' + e + ' '); } catch (e2) { } }
                            }
                        });
                        golist.push({
                            label: 'Select all compounds (' + __cs.length + ')',
                            move: () => { },
                            click: () => {
                                try { graph.showSideMenu(null); } catch (e) { }
                                let n = 0;
                                for (const o of __cs) { try { graph.addOligoToSelection(o, selectedTrack); n++; } catch (e) { } }
                                try { if (graph.wake) graph.wake(); } catch (e) { }
                                // They land in the selection window, where the packaged
                                // "Compounds (N)" row opens the actions for the whole set.
                                try { graph.setMessage(' Selected ' + n + ' compound' + (n === 1 ? '' : 's') + ' — see the selection window. '); } catch (e) { }
                            }
                        });
                    }
                } catch (e) { }

                if (selectedTrack.containsIntrons()) {
                } else {

                }


                let track_list = [
                    {
                        label: 'Move track',
                        click: async () => {
                            // Enter move mode: click-drag anywhere on the canvas to
                            // reposition this track freely (both axes). The position
                            // persists on tgraph and the render loop repaints it.
                            const moveTrack = selectedTrack;
                            if (!moveTrack || !moveTrack.tgraph) { graph.setMessage(' No track to move.'); return; }
                            graph.showSideMenu(null);
                            graph.clearMouseListeners();
                            // NOTE: do NOT call graph.selectOff() here — that would
                            // deselect the track/annotations the user picked. Keep the
                            // current selection intact while moving.
                            graph.setMessage(' Move mode — click and drag to reposition "'
                                + (moveTrack.name || 'track') + '".');
                            // Freeze canvas panning while in move mode. FlexiGraph only
                            // pans when graph.graph.mode === 'navigate', so take it off
                            // navigate; each drag repositions the track, not the view.
                            if (graph.graph) graph.graph.mode = 'move';
                            // `armed` becomes true only on a real canvas mouse-DOWN that
                            // happens AFTER these listeners exist. The menu-item click's
                            // own mouse-up fires before any such press, so it is ignored
                            // and the user still gets to drag.
                            let dragging = false, armed = false, pushed = false, downx = 0, downy = 0, startXi = 0, startYi = 0;
                            graph.addMouseDownListener((xwc, ywc) => {
                                // Re-assert non-navigate BEFORE FlexiGraph's own mousedown
                                // pan-anchor check runs, so this drag never pans the canvas.
                                if (graph.graph) graph.graph.mode = 'move';
                                dragging = true;
                                armed = true;
                                pushed = false;   // snapshot for undo on the first real move
                                downx = xwc; downy = ywc;
                                startXi = moveTrack.tgraph.xi;
                                startYi = moveTrack.tgraph.yi;
                                moveTrack.showResizeBar = true;
                            });
                            graph.addMouseMoveListener((xwc, ywc) => {
                                if (!dragging) return;
                                // Push the pre-move state onto the graph history exactly
                                // once per drag (before the position changes) so Ctrl+Z
                                // restores where the track was.
                                if (!pushed) {
                                    try { graph.pushOntoHistory(); } catch (e) { }
                                    pushed = true;
                                }
                                moveTrack.tgraph.xi = startXi + (xwc - downx);
                                moveTrack.tgraph.yi = startYi + (ywc - downy);
                                try { moveTrack.tgraph.rescale(); } catch (e) { }
                            });
                            graph.addMouseUpListener((xwc, ywc) => {
                                // Ignore the mouse-up from the menu click itself.
                                if (!armed) return;
                                dragging = false;
                                moveTrack.showResizeBar = false;
                                // Drop complete: leave move mode and restore normal
                                // navigate (panning) + the mouse-over hover menu.
                                if (graph.graph) graph.graph.mode = 'navigate';
                                graph.clearMouseListeners();
                                exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout);
                            });
                        }
                    },
                    {
                        // Single top-level "Variants" entry (SNPs merged in): pick a source, plus
                        // Show/Hide, Filter and Remove. Clicking ClinVar opens the clinical-
                        // significance choice (pathogenic / likely-pathogenic / benign / …).
                        label: 'Variants ▸',
                        move: () => { },
                        click: async (scx, scy) => {
                            const tr = selectedTrack;
                            if (!tr) { graph.setMessage(' No track selected.'); return; }
                            const server = (window['env'] && window['env']['apiUrl']) || window.location.origin;
                            const selRange = () => {
                                try {
                                    if (tr.markstart != null && tr.markend != null && tr.markend > tr.markstart) {
                                        return { lo: Math.min(tr.markstart, tr.markend), hi: Math.max(tr.markstart, tr.markend) };
                                    }
                                } catch (e) { }
                                return null;
                            };
                            // ClinVar → clinical significance → load via points-of-interest.js.
                            const loadSig = async (sigKey) => {
                                try { graph.showSideMenu(null); } catch (e) { }
                                try { await exec('baja/manchester/menu/points-of-interest.js', graph, genegraph_panel_layout, tr, sigKey); }
                                catch (e) { try { graph.setMessage(' Variant load failed: ' + (e && e.message ? e.message : e)); } catch (e2) { } }
                            };
                            let openMain;
                            const openClinVar = () => {
                                const sigList = [
                                    { label: 'Pathogenic / likely-pathogenic', key: 'pathogenic' },
                                    { label: 'Likely pathogenic', key: 'likely_pathogenic' },
                                    { label: 'Benign / likely-benign', key: 'benign' },
                                    { label: 'Likely benign', key: 'likely_benign' },
                                    { label: 'Uncertain / conflicting', key: 'uncertain' },
                                    { label: 'All', key: 'all' },
                                ];
                                const items = sigList.map((s) => ({ label: s.label, move: () => { }, click: () => { loadSig(s.key); } }));
                                items.push({ label: '‹ Back', move: () => { }, click: () => { openMain(); } });
                                try { graph.showSideMenu(orderMenu(items), null, 'Signatures ▸'); } catch (e) { }
                            };
                            const loadFrom = (db, label) => { graph.showSideMenu(null); exec('baja/data/load-variants.js', server, graph, genegraph_panel_layout, db, label); };
                            // Tour the track's mutations: select + zoom each, with Prev/Next/Done.
                            const runTour = () => {
                                const tsnps = (tr.snpindels || []).slice().sort((p, q) => (p.xi || 0) - (q.xi || 0));
                                if (!tsnps.length) { graph.setMessage(' No mutations to tour on this track. '); return; }
                                const zoomSnp = async (s) => {
                                    try { await exec('baja/manchester/menu/focus-mutation.js', graph, s, 10000); } catch (e) { }
                                    try {
                                        const tg = tr.tgraph, TARGET_PXPB = 6;
                                        let gridW = 800; try { gridW = (graph.grid && graph.grid.width) || (graph.canvas && graph.canvas.width) || 800; } catch (e) { }
                                        const wpb = Math.abs((tg.X((s.xi || 0) + 1) - tg.X(s.xi || 0)) || 1) || 1;
                                        const half = (wpb * gridW) / (2 * TARGET_PXPB);
                                        const cw = tg.X(s.xi || 0);
                                        const yA = tg.yi, yB = tg.yi + (tg.height || 0), cy = (yA + yB) / 2, span = Math.abs(yB - yA) || 0.1;
                                        graph.animating = false;
                                        if (graph.zoomRect) graph.zoomRect(cw - half, cw + half, cy + span * 3.6, cy - span * 2.2, 300);
                                    } catch (e) { }
                                    try { if (graph.wake) graph.wake(); } catch (e) { }
                                };
                                let i = 0, cancelled = false, timer = null;
                                const clearT = () => { if (timer) { clearTimeout(timer); timer = null; } };
                                const finish = () => { cancelled = true; clearT(); try { graph.showSideMenu(null); } catch (e) { } };
                                const go = async () => {
                                    clearT();
                                    if (cancelled) return;
                                    if (i < 0) i = 0;
                                    if (i >= tsnps.length) { finish(); return; }
                                    const s = tsnps[i];
                                    await zoomSnp(s);
                                    if (cancelled) return;
                                    const nm = (s.name || s.id || ('Variant ' + (i + 1)));
                                    try {
                                        graph.showSideMenu([
                                            { label: 'Tour  ' + (i + 1) + ' / ' + tsnps.length + ':  ' + nm, move: () => { }, click: () => { clearT(); go(); } },
                                            { label: '‹ Previous', move: () => { }, click: () => { clearT(); i = Math.max(0, i - 1); go(); } },
                                            { label: 'Next ›', move: () => { }, click: () => { clearT(); i++; go(); } },
                                            { label: '✓ Done', move: () => { }, click: () => { finish(); } },
                                        ], null, 'Variant tour ▸');
                                    } catch (e) { }
                                    timer = setTimeout(() => { i++; go(); }, 10000);
                                };
                                go();
                            };
                            openMain = () => {
                                try {
                                    const __items = [
                                        { label: (tr.showSnpIndels === false ? 'Show variants' : 'Hide variants'), move: () => { }, click: () => { tr.showSnpIndels = (tr.showSnpIndels === false); if (graph.wake) graph.wake(); graph.showSideMenu(null); } },
                                    ];
                                    // Only offer Tour / annotation controls when the track actually has variants.
                                    if ((tr.snpindels || []).length) {
                                        __items.push({ label: '▶ Tour mutations', move: () => { }, click: () => { runTour(); } });
                                        // Hide (or re-show) the annotation callout windows of every variant on the track.
                                        __items.push({
                                            label: ((tr.snpindels || []).some((s) => s && s.showAnnotation) ? 'Hide annotations' : 'Show annotations'),
                                            move: () => { },
                                            click: () => {
                                                const anyOn = (tr.snpindels || []).some((s) => s && s.showAnnotation);
                                                for (const s of (tr.snpindels || [])) { if (s) s.showAnnotation = !anyOn; }
                                                if (graph.wake) graph.wake();
                                                graph.showSideMenu(null);
                                                try { graph.setMessage(anyOn ? ' Annotations hidden. ' : ' Annotations shown. '); } catch (e) { }
                                            }
                                        });
                                    }
                                    __items.push(
                                        { label: 'ClinVar ▸', move: () => { }, click: () => { openClinVar(); } },
                                        { label: 'dbSNP', move: () => { }, click: () => { loadFrom('dbsnp', 'dbSNP'); } },
                                        { label: 'gnomAD', move: () => { }, click: () => { loadFrom('gnomad', 'gnomAD'); } },
                                        { label: 'COSMIC', move: () => { }, click: () => { loadFrom('cosmic', 'COSMIC'); } },
                                        { label: 'Filter', move: () => { }, click: () => { graph.showSideMenu(null); exec('baja/manchester/menu/edit-snps-filter-menu.js', graph, genegraph_panel_layout, tr, selRange()); } },
                                        {
                                            label: 'Remove all', move: () => { }, click: () => {
                                                const count = (tr.snpindels || []).length;
                                                if (!count) { graph.showSideMenu(null); graph.setMessage(' No variants on this track. '); return; }
                                                graph.showSideMenu([
                                                    {
                                                        label: 'Yes, remove ' + count + ' variant' + (count === 1 ? '' : 's'), move: () => { }, click: () => {
                                                            try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }
                                                            tr.snpindels = [];
                                                            try { if (tr.clearDescendantSnps) tr.clearDescendantSnps(graph); } catch (e) { }
                                                            if (graph.wake) graph.wake();
                                                            graph.showSideMenu(null);
                                                            graph.setMessage(' Removed ' + count + ' variant' + (count === 1 ? '' : 's') + '. ');
                                                        }
                                                    },
                                                    { label: 'Cancel', move: () => { }, click: () => { openMain(); } }
                                                ], null, 'Remove all variants ▸');
                                            }
                                        }
                                    );
                                    graph.showSideMenu(__items, null, 'Variants ▸');
                                } catch (e) { }
                            };
                            openMain();
                        },
                    },
                    {
                        label: 'Go to...',
                        click: async (scx, scy) => {
                            const golist = [
                                {
                                    label: 'Genomic loc',
                                    click: async (scx, scy) => {

                                        md = false;

                                        function parseTrackCoordinateInput(input) {
                                            if (input == null) return null;

                                            let raw = String(input).trim();
                                            if (!raw) return null;
                                            raw = raw
                                                .toLowerCase()
                                                .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
                                                .replace(/\s+/g, " ")
                                                .trim();

                                            raw = raw
                                                .replace(/\b(\d{1,3})(,\d{3})+\b/g, (m) => m.replace(/,/g, ""))
                                                .replace(/(\d),(\d{1,2})\b/g, "$1.$2");

                                            const matches = raw.match(/-?\d+(?:\.\d+)?/g);
                                            if (!matches || matches.length === 0) return null;

                                            const nums = matches
                                                .map(n => Math.floor(Number(n)))
                                                .filter(n => Number.isFinite(n));

                                            if (nums.length === 0) return null;

                                            if (nums.length === 1) {
                                                return { start: nums[0], end: -1 };
                                            }

                                            let start = nums[0];
                                            let end = nums[1];

                                            if (end < start) [start, end] = [end, start];

                                            return { start, end };
                                        }

                                        let coordinates = null;
                                        try {
                                            const arg = (graph && graph.graph) ? graph : { graph };
                                            const res = selectedTrack.gitVisibleTrackRange(arg);
                                            if (res && typeof res === "object") coordinates = res;
                                        } catch (e) {
                                            console.warn("Unable to get visible track range:", e);
                                        }

                                        if (!coordinates || coordinates.start == null || coordinates.end == null || coordinates === -1) {
                                            coordinates = selectedTrack.getTrackCoordinates
                                                ? selectedTrack.getTrackCoordinates()
                                                : { start: 0, end: -1 };
                                        }

                                        const start0 = Math.floor(Number(coordinates.start) || 0);
                                        const end0 = Math.floor(Number(coordinates.end));

                                        let windowWidth = (Number.isFinite(end0) && end0 >= 0) ? Math.max(1, end0 - start0) : 100;

                                        const centerposition = start0 + Math.floor(windowWidth / 2);

                                        let stringRepresentation = String(centerposition);

                                        setTimeout(async () => {
                                            let userInput = await prompt(
                                                "Position",
                                                ["Position"],
                                                { "Position": stringRepresentation },
                                                600,
                                                300
                                            );
                                            const positionStr =
                                                typeof userInput === "string"
                                                    ? userInput
                                                    : userInput?.Position;
                                            const parsed = parseTrackCoordinateInput(positionStr);
                                            if (parsed) {

                                                const targetCenter =
                                                    parsed.end < 0
                                                        ? parsed.start
                                                        : Math.floor((parsed.start + parsed.end) / 2);

                                                const newStart = Math.floor(targetCenter - windowWidth / 2);
                                                const newEnd = newStart + windowWidth;

                                                selectedTrack.setTrackCoordinatesAnimated(graph, newStart, newEnd, 3000);
                                            } else {
                                                console.warn("Invalid position input:", positionStr);
                                            }
                                        }, 1000);

                                    },
                                },
                                {
                                    label: 'Genomic Range',
                                    click: async (scx, scy) => {

                                        md = false;

                                        function parseTrackCoordinateInput(input) {
                                            if (input == null) return null;

                                            let raw = String(input).trim();
                                            if (!raw) return null;

                                            raw = raw
                                                .toLowerCase()
                                                .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
                                                .replace(/\s+/g, " ")
                                                .trim();

                                            raw = raw

                                                .replace(/\b(\d{1,3})(,\d{3})+\b/g, (m) => m.replace(/,/g, ""))

                                                .replace(/(\d),(\d{1,2})\b/g, "$1.$2");

                                            const matches = raw.match(/-?\d+(?:\.\d+)?/g);
                                            if (!matches || matches.length === 0) return null;

                                            const nums = matches
                                                .map(n => Math.floor(Number(n)))
                                                .filter(n => Number.isFinite(n));

                                            if (nums.length === 0) return null;

                                            if (nums.length === 1) {
                                                return { start: nums[0], end: -1 };
                                            }

                                            let start = nums[0];
                                            let end = nums[1];

                                            if (end < start) [start, end] = [end, start];

                                            return { start, end };
                                        }

                                        let coordinates = null;
                                        try {

                                            const arg = (graph && graph.graph) ? graph : { graph };

                                            const res = selectedTrack.gitVisibleTrackRange(arg);
                                            if (res && typeof res === "object") {
                                                coordinates = res;
                                            }
                                        } catch (e) {
                                            console.warn("Unable to get visible track range:", e);
                                        }

                                        if (!coordinates || coordinates.start == null || coordinates.end == null) {

                                            coordinates = selectedTrack.getTrackCoordinates
                                                ? selectedTrack.getTrackCoordinates()
                                                : { start: 0, end: -1 };
                                        }

                                        const start0 = Math.floor(Number(coordinates.start) || 0);
                                        const end0 = Math.floor(Number(coordinates.end));

                                        let stringRepresentation =
                                            Number.isFinite(end0) && end0 >= 0
                                                ? `${start0}:${end0}`
                                                : `${start0}`;

                                        setTimeout(async () => {
                                            let userInput = await prompt(
                                                "Ranage",
                                                ["Range"],
                                                { "Ranage": stringRepresentation },
                                                600,
                                                300
                                            );

                                            const thresholdStr =
                                                typeof userInput === "string"
                                                    ? userInput
                                                    : userInput?.Threshold;

                                            const parsed = parseTrackCoordinateInput(thresholdStr);

                                            if (parsed) {
                                                selectedTrack.setTrackCoordinatesAnimated(graph, parsed.start, parsed.end, 3000);
                                            } else {
                                                console.warn("Invalid track coordinate input:", thresholdStr);
                                            }

                                        }, 1000)

                                    },
                                },
                                {
                                    label: 'Next annotation',
                                    click: async (scx, scy) => {
                                        {

                                            function jumpCenterToAnnotation(graph, selectedTrack, ann) {
                                                if (!ann) return;

                                                const { start, end } = selectedTrack.gitVisibleTrackRange(graph);
                                                const span = (end >= 0) ? Math.max(1, end - start) : 0;

                                                const annXi = Number(ann.xi);
                                                const annXf = Number(ann.xf);
                                                const annMid = (Number.isFinite(annXi) && Number.isFinite(annXf))
                                                    ? (annXi + annXf) / 2
                                                    : (Number.isFinite(annXi) ? annXi : 0);

                                                let newStart, newEnd;
                                                if (end >= 0) {
                                                    newStart = Math.floor(annMid - span / 2);
                                                    newEnd = Math.floor(newStart + span);
                                                } else {
                                                    newStart = Math.floor(annMid);
                                                    newEnd = -1;
                                                }

                                                graph.setCenterMessage(ann.name || ann.label || ann.id || 'Annotation');

                                                selectedTrack.setTrackCoordinatesAnimated(graph, newStart, newEnd, 3000);
                                            }

                                            function openNearestAnnotationsMenu(graph, selectedTrack) {
                                                const { start, end } = selectedTrack.gitVisibleTrackRange(graph);
                                                const span = (end >= 0) ? Math.max(1, end - start) : 0;
                                                const centerX = (end >= 0) ? (start + span / 2) : start;

                                                const topTen = selectedTrack.getNearestAnnotations(null, centerX, 10) || [];

                                                if (!topTen.length) {
                                                    console.warn("No annotations available.");
                                                    showSideMenuDelayed([{ label: 'No annotations found', click: () => { } }]);
                                                    return;
                                                }

                                                const menuList = topTen.map((ann, idx) => {
                                                    const title =
                                                        ann.name ??
                                                        ann.label ??
                                                        ann.id ??
                                                        ann.type ??
                                                        `Annotation ${idx + 1}`;

                                                    const coords =
                                                        (ann.xi != null && ann.xf != null) ? ` [${ann.xi}-${ann.xf}]` : '';

                                                    return {
                                                        label: `${title}${coords}`,
                                                        click: () => jumpCenterToAnnotation(graph, selectedTrack, ann),
                                                    };
                                                });

                                                menuList.unshift({
                                                    label: `Nearest annotations to center (${Math.floor(centerX)})`,
                                                    click: () => { },
                                                });

                                                menuList.push({
                                                    label: 'Refresh menu',
                                                    click: () => openNearestAnnotationsMenu(graph, selectedTrack),
                                                });

                                                showSideMenuDelayed(menuList);
                                            }

                                            setTimeout(() => {
                                                openNearestAnnotationsMenu(graph, selectedTrack);
                                            }, 1000);
                                        }

                                    },
                                },
                                {
                                    label: "Nearest  motif",
                                    click: async (scx, scy) => {

                                        setTimeout(async () => {

                                            const user_entered_motif = await prompt(
                                                "Sequence (>4)",
                                                ["Sequence"],
                                                { "Sequence": "" },
                                                600,
                                                400
                                            );

                                            const seqs = selectedTrack.sequence;
                                            const startIndex = selectedTrack.tgraph.getxmin();

                                            function findMotifHits(sequence, motif, startIndex, { caseInsensitive = true, maxHits = 100 } = {}) {
                                                if (sequence == null) throw new Error("Track sequence is missing.");
                                                if (motif == null) throw new Error("Motif is required.");

                                                let seq = String(sequence);
                                                let m = String(motif).trim().replace(/\s+/g, "");

                                                if (!m) throw new Error("Motif is empty.");
                                                if (m.length <= 4) throw new Error("Motif must be longer than 4 characters.");

                                                if (caseInsensitive) {
                                                    seq = seq.toUpperCase();
                                                    m = m.toUpperCase();
                                                }

                                                const hits = [];
                                                let i = 0;

                                                while (hits.length < maxHits) {
                                                    const idx = seq.indexOf(m, i);
                                                    if (idx === -1) break;

                                                    const hitStart = startIndex + idx;
                                                    const hitEndInclusive = hitStart + m.length - 1;

                                                    hits.push({
                                                        xi: hitStart,
                                                        xf: hitEndInclusive,
                                                        offsetStart: idx,
                                                        offsetEndInclusive: idx + m.length - 1,
                                                        name: m,
                                                        label: `Motif ${m}`
                                                    });

                                                    i = idx + 1;
                                                }

                                                return { hits, truncated: hits.length === maxHits };
                                            }

                                            function nearestHits(hits, cursorCoord, n = 10) {
                                                const cursor = Number(cursorCoord);
                                                return hits
                                                    .slice()
                                                    .sort((a, b) => {
                                                        const am = (Number(a.xi) + Number(a.xf)) / 2;
                                                        const bm = (Number(b.xi) + Number(b.xf)) / 2;
                                                        const da = Math.abs(am - cursor);
                                                        const db = Math.abs(bm - cursor);
                                                        return da !== db ? da - db : (Number(a.xi) - Number(b.xi));
                                                    })
                                                    .slice(0, Math.min(n, hits.length));
                                            }

                                            function jumpCenterToRange(graph, selectedTrack, rangeLike) {
                                                if (!rangeLike) return;

                                                const { start, end } = selectedTrack.gitVisibleTrackRange(graph);
                                                const span = (end >= 0) ? Math.max(1, end - start) : 0;

                                                const annXi = Number(rangeLike.xi);
                                                const annXf = Number(rangeLike.xf);
                                                const annMid =
                                                    (Number.isFinite(annXi) && Number.isFinite(annXf))
                                                        ? (annXi + annXf) / 2
                                                        : (Number.isFinite(annXi) ? annXi : 0);

                                                let newStart, newEnd;
                                                if (end >= 0) {
                                                    newStart = Math.floor(annMid - span / 2);
                                                    newEnd = Math.floor(newStart + span);
                                                } else {
                                                    newStart = Math.floor(annMid);
                                                    newEnd = -1;
                                                }

                                                graph.setCenterMessage(rangeLike.name || rangeLike.label || rangeLike.id || "Motif");
                                                selectedTrack.setTrackCoordinatesAnimated(graph, newStart, newEnd, 3000);
                                            }

                                            const cursorCoord = (typeof scx === "number") ? scx : startIndex;

                                            const motif = user_entered_motif["Sequence"];
                                            const { hits, truncated } = findMotifHits(seqs, motif, startIndex, {
                                                caseInsensitive: true,
                                                maxHits: 100
                                            });

                                            if (!hits.length) {
                                                console.log(`No hits found for motif "${motif}"`);
                                                return;
                                            }

                                            const nearest10 = nearestHits(hits, cursorCoord, 10);

                                            const menuItems = nearest10.map((h, idx) => {
                                                const mid = (Number(h.xi) + Number(h.xf)) / 2;
                                                const dist = Math.abs(mid - cursorCoord);

                                                return {
                                                    label: `#${idx + 1}${h.xi}–${h.xf} (Δ${Math.floor(dist)})`,
                                                    click: () => jumpCenterToRange(graph, selectedTrack, h)
                                                };
                                            });

                                            if (truncated) {
                                                menuItems.push({
                                                    label: "Note: total hits capped at 100",
                                                    click: () => { }
                                                });
                                            }
                                            if (__menuAllowedOnTap()) showSideMenuDelayed(menuItems);

                                        }, 1300)

                                    }

                                }
                                ,
                                {
                                    label: 'Next snp|indel',
                                    click: async (scx, scy) => {
                                        {
                                            function jumpCenterToSnp(graph, selectedTrack, snp) {
                                                if (!snp) return;

                                                const { start, end } = selectedTrack.gitVisibleTrackRange(graph);
                                                const span = (end >= 0) ? Math.max(1, end - start) : 0;

                                                const xi = Number(snp.xi);
                                                const xf = Number(snp.xf);

                                                const mid = (Number.isFinite(xi) && Number.isFinite(xf))
                                                    ? (xi + xf) / 2
                                                    : (Number.isFinite(xi) ? xi : (Number.isFinite(xf) ? xf : 0));

                                                let newStart, newEnd;
                                                if (end >= 0) {
                                                    newStart = Math.floor(mid - span / 2);
                                                    newEnd = Math.floor(newStart + span);
                                                } else {
                                                    newStart = Math.floor(mid);
                                                    newEnd = -1;
                                                }

                                                const title =
                                                    snp.name ??
                                                    snp.label ??
                                                    snp.id ??
                                                    snp.rsid ??
                                                    snp.type ??
                                                    'SNP';

                                                graph.setCenterMessage(title);

                                                selectedTrack.setTrackCoordinatesAnimated(graph, newStart, newEnd, 3000);
                                            }

                                            function openNearestSnpsMenu(graph, selectedTrack) {
                                                const { start, end } = selectedTrack.gitVisibleTrackRange(graph);
                                                const span = (end >= 0) ? Math.max(1, end - start) : 0;
                                                const centerX = (end >= 0) ? (start + span / 2) : start;

                                                const topTen = selectedTrack.getNearestSnpindels(centerX, graph, 10) || [];

                                                if (!topTen.length) {
                                                    console.warn("No SNPs available.");
                                                    showSideMenuDelayed([{ label: 'No SNPs found', click: () => { } }]);
                                                    return;
                                                }

                                                const menuList = topTen.map((snp, idx) => {
                                                    const title =
                                                        snp.name ??
                                                        snp.label ??
                                                        snp.id ??
                                                        snp.rsid ??
                                                        snp.type ??
                                                        `SNP ${idx + 1}`;

                                                    const coords =
                                                        (snp.xi != null && snp.xf != null) ? ` ` :
                                                            (snp.xi != null) ? ` [${snp.xi}]` :
                                                                '';

                                                    const extra =
                                                        (snp.ref != null && snp.alt != null) ? ` ${snp.ref}>${snp.alt}` : '';

                                                    return {
                                                        label: `${title}${coords}${extra}`,
                                                        click: () => jumpCenterToSnp(graph, selectedTrack, snp),
                                                    };
                                                });

                                                menuList.push({
                                                    label: 'Refresh menu',
                                                    click: () => openNearestSnpsMenu(graph, selectedTrack),
                                                });

                                                menuList.push({
                                                    label: 'Close menu',
                                                    click: () => {
                                                        graph.showSideMenu(null)
                                                    },
                                                });
                                                showSideMenuDelayed(menuList);
                                            }
                                            setTimeout(() => {
                                                openNearestSnpsMenu(graph, selectedTrack);
                                            }, 1000);
                                        }
                                    },
                                }

                            ]
                            showSideMenuDelayed(golist);
                        },

                    },
                    {
                        label: "Draw",
                        click: async (scx, scy) => {
                            const ssubmenu = [
                                {
                                    label: `Draw text`,
                                    click: async () => {
                                        setTimeout(async () => {
                                            await exec('baja/manchester/menu/text-box-action.js', graph)
                                            graph.showSideMenu(null);
                                        }, 400)
                                    }
                                },
                                {
                                    label: `Rectangle`,
                                    click: async () => {
                                        setTimeout(async () => {

                                            await exec('baja/manchester/menu/draw-rect-action.js', graph)
                                            graph.showSideMenu(null);
                                        }, 400)

                                    }
                                }, {
                                    label: `Oval`,
                                    click: async () => {
                                        setTimeout(async () => {

                                            await exec('baja/manchester/menu/draw-oval-action.js', graph)
                                            graph.showSideMenu(null);
                                        }, 400)

                                    }
                                },
                                {
                                    label: `Arrow`,
                                    click: async () => {
                                        setTimeout(async () => {
                                            await exec('baja/manchester/menu/draw-line-action.js', graph)
                                            graph.showSideMenu(null);
                                        }, 400)

                                    }
                                },
                                {
                                    label: `Highlight Compounds`,
                                    click: async () => {
                                        graph.setMessage(" Highlight compounds ")
                                        for (let t of graph.track) {
                                            t.quickHighlightOligos();
                                        }
                                        graph.showSideMenu(null);
                                    }
                                }

                            ];

                            showSideMenuDelayed(ssubmenu);

                        }
                    },
                    {
                        label: "Chemistry",
                        click: async (scx, scy) => {
                            graph.setMessage("Loading chemistry database...");
                            const selected = async (v) => {
                                graph.props.selected_chemistry = v;
                                setTimeout(async () => {
                                    await exec('baja/manchester/menu/compound-editor.js', graph, genegraph_panel_layout);
                                    graph.setMessage(" Chemistry selected : " + graph.props.selected_chemistry.name);
                                }, 1000);
                            };
                            let submenus = []
                            let ChemistryTemplateDB = await exec('baja/chem/chem-template-repo.js');
                            let cdb = await new ChemistryTemplateDB();
                            let l = await cdb.load();
                            let designs = [];
                            let content = {};
                            for (let li of l) {
                                if (li && li.name != null) {
                                    designs.push(li.name);
                                    content[li.name] = li.description || '';
                                    submenus.push({
                                        label: li.name,
                                        click: async (scx, scy) => {
                                            selected(li)
                                            graph.showSideMenu(null)
                                        }
                                    })
                                }
                            }
                            showSideMenuDelayed(submenus)
                        }
                    }, {
                        label: "Design ▸",
                        click: async (scx, scy) => {
                            // Design menu extracted to a standalone module so the info-panel
                            // Tracks child menu (gene.js openTracks) opens the identical designer.
                            try { await exec('baja/manchester/menu/track-design-menu.js', graph, selectedTrack, genegraph_panel_layout); } catch (e) { }
                        }
                    },
                    // annotations_menu removed — annotations are now their own type in
                    // the selection window.
                    ...golist,
                    {
                        label: 'Export',
                        click: async () => {
                            // Side menu to export track features: BED, oligos
                            // (FASTA / HELM / IDT), primers (CSV for Excel).
                            await exec('baja/manchester/menu/track-export-menu.js', graph, genegraph_panel_layout, selectedTrack);
                        },
                        move: () => { }
                    },
                    {
                        label: 'Synthesis cost',
                        click: async () => {
                            // What the compounds on this track cost to make, priced per
                            // 78-well plate at 250 nmol.
                            await exec('baja/manchester/menu/synthesis-cost.js', graph, selectedTrack, genegraph_panel_layout);
                        },
                        move: () => { }
                    },
                    {
                        label: 'Layers ▸',
                        click: async (scx, scy) => {

                            const golist = [




                                {
                                    // Edit the layers this track ALREADY has: show/hide, remove,
                                    // interaction, background, per layer and in bulk.
                                    //
                                    // Through track-layers-side-menu.js rather than the full-panel
                                    // editor: that one mounts its panel with
                                    // clearComponent('mainPanel') + setComponent, and the editor
                                    // stashes its own layout there, so it blanked the canvas behind
                                    // the menu -- the same fault just fixed in patents.js. The side
                                    // menu leaves the canvas alone.
                                    label: 'Edit...',
                                    move: () => { },
                                    click: async () => {
                                        graph.showSideMenu(null);
                                        if (!selectedTrack) {
                                            try { graph.setResultMessage(' No track to edit layers on. '); } catch (e) { }
                                            return;
                                        }
                                        const n = ((selectedTrack.track_layers || []).length);
                                        if (!n) {
                                            try { graph.setResultMessage(' ' + (selectedTrack.name || 'That track') + ' has no layers yet. '); } catch (e) { }
                                            return;
                                        }
                                        await exec('baja/manchester/menu/track-layers-side-menu.js',
                                            selectedTrack, genegraph_panel_layout, graph);
                                    }
                                },
                                {
                                    // Pick a layer by NAME and remove it. The layers on a track
                                    // are what the data and model runs left behind, and until now
                                    // the only way to take one off was the layer editor.
                                    label: 'Delete layer ▸',
                                    move: () => { },
                                    click: () => {
                                        const layers = (selectedTrack && selectedTrack.track_layers) || [];
                                        if (!layers.length) {
                                            graph.showSideMenu(null);
                                            try { graph.setResultMessage(' ' + ((selectedTrack && selectedTrack.name) || 'That track') + ' has no layers. '); } catch (e) { }
                                            return;
                                        }
                                        const nameOf = (l, i) => ('' + ((l && (l.name || l.data_type || l.attribution_type)) || ('layer ' + (i + 1))));
                                        const items = layers.map((l, i) => ({
                                            label: nameOf(l, i),
                                            move: () => { },
                                            click: () => {
                                                graph.showSideMenu(null);
                                                // History first: removing a layer discards whatever
                                                // the run that produced it computed, and re-running
                                                // it can be a minute of python.
                                                try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }
                                                try {
                                                    selectedTrack.track_layers = (selectedTrack.track_layers || []).filter((x) => x !== l);
                                                } catch (e) { }
                                                try { if (graph.wake) graph.wake(); } catch (e) { }
                                                try { graph.setResultMessage(' Removed layer "' + nameOf(l, i) + '". '); } catch (e) { }
                                            }
                                        }));
                                        items.push({ label: '‹ Back', move: () => { }, click: () => { showSideMenuDelayed(golist, undefined, undefined, 'Layers ▸'); } });
                                        graph.showSideMenu(items, null, 'Delete layer ▸');
                                    }
                                },
                                {
                                    // All of them, behind a confirmation. This is the one action
                                    // here that cannot be undone by repeating a menu click.
                                    label: 'Delete all layers on this track',
                                    move: () => { },
                                    click: () => {
                                        const layers = (selectedTrack && selectedTrack.track_layers) || [];
                                        const n = layers.length;
                                        if (!n) {
                                            graph.showSideMenu(null);
                                            try { graph.setResultMessage(' ' + ((selectedTrack && selectedTrack.name) || 'That track') + ' has no layers. '); } catch (e) { }
                                            return;
                                        }
                                        graph.showSideMenu([
                                            {
                                                label: 'Yes, remove ' + n + ' layer' + (n === 1 ? '' : 's'),
                                                move: () => { },
                                                click: () => {
                                                    graph.showSideMenu(null);
                                                    try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }
                                                    try { selectedTrack.track_layers = []; } catch (e) { }
                                                    try { if (graph.wake) graph.wake(); } catch (e) { }
                                                    try { graph.setResultMessage(' Removed ' + n + ' layer' + (n === 1 ? '' : 's') + ' from ' + ((selectedTrack && selectedTrack.name) || 'the track') + '. '); } catch (e) { }
                                                }
                                            },
                                            { label: 'Cancel', move: () => { }, click: () => { showSideMenuDelayed(golist, undefined, undefined, 'Layers ▸'); } }
                                        ], null, 'Remove all layers ▸');
                                    }
                                },
                                {
                                    // The library of data classes that can become layers —
                                    // RNASeq opens the RNASeq Library, which loads a chosen
                                    // dataset onto every track on the board.
                                    label: 'Data Resources...',
                                    move: () => { },
                                    click: async () => {
                                        graph.showSideMenu(null);
                                        await exec('baja/data/data-resources-library.js', graph, genegraph_panel_layout, selectedTrack ? [selectedTrack] : []);
                                    }
                                },
                                {
                                    // Classes of data that become track layers. RNASeq descends
                                    // species -> tissue -> dataset; the library view lists every
                                    // dataset with a description.
                                    // Same as the Layers ▸ Data node above: straight to the
                                    // Data Resources Library.
                                    label: 'Data...',
                                    move: () => { },
                                    click: async () => {
                                        graph.showSideMenu(null);
                                        await exec('baja/data/data-resources-library.js', graph, genegraph_panel_layout, selectedTrack ? [selectedTrack] : []);
                                    }
                                },
                                {
                                    // Predictive models that write their output onto tracks as
                                    // layers. Same entry points as the Predictive-models toolbar
                                    // (baja/ml/predictive-models-toolbar.js).
                                    // Same as the Layers ▸ Models node above: straight to the
                                    // ML Models Library.
                                    label: 'Models...',
                                    move: () => { },
                                    click: async () => {
                                        graph.showSideMenu(null);
                                        // From a TRACK menu: this track is the target, so it is passed in rather than
                                        // left to be guessed from the selection.
                                        await exec('baja/ml/models-library.js', graph, genegraph_panel_layout, selectedTrack ? [selectedTrack] : []);
                                    }
                                },
                                {
                                    label: 'New...',
                                    click: () => {
                                        let data_menu = []
                                        let data_items = window['env']['data']

                                        // These load straight onto THE TRACK THIS MENU BELONGS TO.
                                        // The track is passed as a one-element list, which is the
                                        // contract every loader now takes, so there is no click to
                                        // pick a track: the user already picked it by opening this
                                        // menu. Each loader clips to markstart..markend on its own,
                                        // so a track with a selected sequence gets the layer over
                                        // that sequence only.
                                        const __only = () => (selectedTrack ? [selectedTrack] : []);
                                        const __runData = async (fn) => {
                                            graph.clearMouseListeners();
                                            graph.setMouseMode('navigate');
                                            graph.showSideMenu(null);
                                            try { await fn(); } catch (e) {
                                                try { graph.setResultMessage(' Could not load: ' + e + ' '); } catch (e2) { }
                                            }
                                        };
                                        for (const __m of [
                                            { label: 'Validated miRNA sites (strong evidence)', key: 'mirtarbase10_strong' },
                                            { label: 'All reported miRNA sites (incl. CLIP)', key: 'mirtarbase10_all' }
                                        ]) {
                                            data_menu.push({
                                                'label': __m.label, click: () => __runData(async () => {
                                                    const SETS = await exec('baja/data/layer-sets.js');
                                                    await exec('baja/data/bed-hits.js', graph, genegraph_panel_layout,
                                                        SETS[__m.key], __only());
                                                })
                                            });
                                        }
                                        data_menu.push({
                                            'label': 'Patents', click: () => __runData(async () => {
                                                await exec('baja/data/patents.js', graph, genegraph_panel_layout, __only());
                                            })
                                        });
                                        data_menu.push({
                                            'label': 'RNASeq…', click: () => __runData(async () => {
                                                await exec('baja/data/rnaseq-library.js', graph, genegraph_panel_layout, __only());
                                            })
                                        });
                                        // Conservation is off until the phyloP / phastCons bigwigs are in
                                        // BIG_DATA -- there are none on this deployment, so the loader
                                        // could only ever open an empty browser. Say so instead of
                                        // opening it; the exec line stays one edit away.
                                        data_menu.push({
                                            'label': 'Conservation (coming soon)', click: () => {
                                                try { graph.showSideMenu(null); } catch (e) { }
                                                try { graph.setResultMessage(' Conservation data is coming soon. '); } catch (e) { }
                                            }
                                        });
                                        data_menu.push({
                                            'label': 'Data Library…', click: () => __runData(async () => {
                                                await exec('baja/data/data-resources-library.js', graph, genegraph_panel_layout, __only());
                                            })
                                        });

                                        data_menu.push({
                                            'label': 'My data', click: async (scx, scy) => {
                                                graph.clearMouseListeners();
                                                graph.setMouseMode('navigate')
                                                await exec('baja/data/my-data.js', graph, genegraph_panel_layout)
                                                graph.showSideMenu(null);

                                            }
                                        })
                                        if (data_items) {
                                            for (let d of data_items) {
                                                data_menu.push({
                                                    'label': d.label, click: async (scx, scy) => {
                                                        graph.clearMouseListeners();
                                                        graph.setMouseMode('navigate')
                                                        await exec(d.script, d.data, d.server, graph, genegraph_panel_layout)
                                                        graph.showSideMenu(null);

                                                    }
                                                })
                                            }
                                        }
                                        showSideMenuDelayed(data_menu);
                                    }
                                },
                            ]
                            golist.push({
                                label: selectedTrack.showLayers ? 'Hide' : 'Show',
                                click: () => {
                                    selectedTrack.showLayers = !selectedTrack.showLayers;
                                    graph.rescale();
                                }
                            });

                            setTimeout(() => {
                                showSideMenuDelayed(golist);

                            }, 100)

                        },
                    },
                ]
                let gfs = graph.getStructure(x, y);
                for (let g of gfs) {
                    let gm_ = {
                        label: ' Remove obj: ' + g.name, click: () => {
                            graph.showSideMenu(null)
                            let zoom_to = {
                                wid: 'card',
                                componentRef: 'bottomPanel',
                                height: '200px',
                                data: {
                                    height: '200px',
                                    cards: [
                                        [
                                            {
                                                'title': ' ', 'body': ``
                                                ,
                                                'width': '90%',
                                                'component':
                                                {
                                                    wid: 'html',
                                                    data: '<font color=red> Remove this drawing object? </font>'
                                                }
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Yes', ionFunction: createIonFunction(() => {
                                                                    graph.currentShape = null;
                                                                    graph.removeShape(g);
                                                                    hideAllModal();
                                                                    graph.showSideMenu(null)
                                                                })
                                                            },
                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                    hideAllModal();
                                                                    graph.showSideMenu(null)

                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                }
                            }
                            showModal(zoom_to)
                        }
                    }
                    let gm_2 = {
                        label: ' Edit obj: ' + g.name, click: () => {
                            graph.showSideMenu(null)
                            let zoom_to = {
                                wid: 'card',
                                componentRef: 'bottomPanel',
                                height: '200px',
                                data: {
                                    height: '200px',
                                    cards: [
                                        [
                                            {
                                                'title': ' ', 'body': ``
                                                ,
                                                'width': '90%',
                                                'component':
                                                {
                                                    wid: 'html',
                                                    data: '<font color=red> Edit object </font>'
                                                }
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Yes', ionFunction: createIonFunction(() => {
                                                                    graph.currentShape = null;
                                                                    graph.removeShape(g);
                                                                    hideAllModal();
                                                                    graph.showSideMenu(null)
                                                                })
                                                            },
                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                    hideAllModal();
                                                                    graph.showSideMenu(null)

                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                }
                            }
                            showModal(zoom_to)
                        }
                    }

                    track_list.push(gm_)
                    track_list.push(gm_2)

                }
                track_list.push({
                    label: 'Delete track',
                    click: async () => {
                        setTimeout(async () => {
                            graph.pushOntoHistory()
                            let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to delete this?', async () => {
                                graph.removeTrack(selectedTrack)
                                graph.setMouseMode('navigate')

                            })
                            showModal(confirm)
                        }, 1000)
                    }
                })
                // Oligo and amplicon options are no longer shown from hover — they are
                // attached, grouped by object type, in the selection window instead.
                // Track-related items float to the top (stable within each group);
                // compound/chemistry/drawing items follow below.
                // If the track has introns, offer to build a spliced mRNA track — but
                // not for a track that is already an mRNA (track_type === 'CDNA').
                try {
                    if (selectedTrack && selectedTrack.track_type !== 'CDNA' && selectedTrack.containsIntrons && selectedTrack.containsIntrons()) {
                        track_list.push({
                            label: 'Create mRNA...',
                            click: async () => {
                                graph.showSideMenu(null);
                                const st = selectedTrack;
                                if (!st) return;
                                if (!st.sequence) { graph.setMessage(' No sequence to splice into mRNA.'); return; }
                                let track;
                                try { track = st.createTrackFromAnnotation('CDNA'); } catch (e) { graph.setMessage(' Could not build mRNA: ' + e); return; }
                                if (!track) { graph.setMessage(' Could not build mRNA track.'); return; }
                                try { if (st.snpindels && st.snpindels.length > 0) { track.liftSnpindels(); track.targetPhase = st.targetPhase; } } catch (e) { }
                                try { if (st.oligos && st.oligos.length > 0) track.liftCompounds(); } catch (e) { }
                                try { if (st.plots && st.plots.length > 0) track.liftPlots(); } catch (e) { }
                                graph.track.push(graph.ensureUniqueTrackName ? graph.ensureUniqueTrackName(track) : track);
                                graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                                graph.deselectAllTracks();
                                track.select();
                                try { graph.animateTo(track.tgraph.xi - 100, track.tgraph.xi + track.tgraph.width + 100, track.tgraph.Y(-3), track.tgraph.Y(3)); } catch (e) { }
                                graph.setMessage(' Created a spliced mRNA track from ' + (st.name || 'track') + '.');
                            },
                            move: () => { }
                        });
                    }
                } catch (e) { }

                // Compounds ▸ — only when the track carries compounds. One compound opens its menu
                // directly; several are listed to pick from (each opens the single-compound menu).
                try {
                    const __compounds = (selectedTrack && Array.isArray(selectedTrack.oligos)) ? selectedTrack.oligos.filter(Boolean) : [];
                    if (__compounds.length) {
                        track_list.push({
                            label: 'Compounds ▸',
                            move: () => { },
                            click: () => {
                                const cs = (selectedTrack.oligos || []).filter(Boolean);
                                if (!cs.length) { graph.setMessage(' No compounds on this track. '); return; }

                                const nameOf = (o, i) => ('' + (o.name || o.id || o.synthesisSequence || o.sequence || ('Compound ' + (i + 1))));
                                const openOne = (o) => {
                                    try { graph.showSideMenu(null); } catch (e) { }
                                    exec('baja/manchester/menu/menu-for-single-aso.js', graph, o, genegraph_panel_layout);
                                };

                                // Picking ONE compound. Past a handful, a side menu is the wrong
                                // shape: it is bounded by the canvas height and has no search, so
                                // finding "ASO-42" among a hundred means paging blindly. The
                                // maximised picker scrolls and filters as you type.
                                const pickOne = () => {
                                    if (cs.length === 1) { openOne(cs[0]); return; }
                                    try { graph.showSideMenu(null); } catch (e) { }
                                    exec('baja/lib/pick-list.js', {
                                        title: 'Compounds on ' + (selectedTrack.name || 'track'),
                                        subtitle: cs.length + ' compounds — type to filter',
                                        items: cs.map((o, i) => ({
                                            label: nameOf(o, i),
                                            sub: ('' + ((o.type || o.modality || '') || '')).trim(),
                                            ref: o
                                        })),
                                        onPick: (it) => { openOne(it.ref); }
                                    });
                                };

                                // One compound: skip the chooser entirely and show the actions
                                // for it, since there is nothing to choose between.
                                const items = [];
                                items.push({
                                    label: cs.length === 1 ? ('Open ' + nameOf(cs[0], 0)) : ('Choose a compound (' + cs.length + ')…'),
                                    move: () => { },
                                    click: () => { pickOne(); }
                                });
                                items.push({
                                    label: 'Run off-targets…', move: () => { },
                                    click: () => {
                                        try { graph.showSideMenu(null); } catch (e) { }
                                        try { window.current = cs[0]; } catch (e) { }
                                        Promise.resolve(exec('baja/manchester/menu/run-off-targets.js',
                                            graph, genegraph_panel_layout, cs)).catch(() => { });
                                    }
                                });
                                items.push({
                                    label: 'Filter…', move: () => { },
                                    click: () => {
                                        try { graph.showSideMenu(null); } catch (e) { }
                                        Promise.resolve(exec('baja/manchester/menu/filter-oligos-by-offtargets.js',
                                            graph, genegraph_panel_layout, selectedTrack)).catch(() => { });
                                    }
                                });
                                items.push({
                                    label: 'Find cross-species', move: () => { },
                                    click: () => {
                                        try { graph.showSideMenu(null); } catch (e) { }
                                        Promise.resolve(exec('baja/manchester/menu/compound-cross-species.js',
                                            graph, genegraph_panel_layout, cs)).catch(() => { });
                                    }
                                });
                                items.push({ label: '‹ Back', move: () => { }, click: () => { try { graph.showSideMenu(null); } catch (e) { } } });
                                graph.showSideMenu(orderMenu(items), null, 'Compounds');
                            }
                        });
                    }
                } catch (e) { }

                // Selected-track menu order: group related actions together — structure/edit,
                // then layers, then analysis/navigation (SNPs, points of interest, Go to), then
                // Properties, with Delete last. Items not listed keep their original order after.
                // Mark the top-level items that open a SUBMENU with ▸ (Compounds ▸ / Variants ▸
                // already carry it) so every submenu reads consistently; orderMenu then groups them
                // first. (Leaf actions like Move track / Properties / Delete are left unmarked.)
                const __trackSubmenus = { 'Layers': 1, 'Data Layers': 1, 'Sequence': 1, 'Go to...': 1, 'Go to': 1 };
                for (const it of track_list) { try { const l = ('' + (it && it.label || '')).trim(); if (__trackSubmenus[l] && !/[▸►]/.test(l)) it.label = l.replace(/\.\.\.$/, '') + ' ▸'; } catch (e) { } }
                const __trackItemLabels = ['Move track', 'Create mRNA', 'Copy to new track', 'Edit track',
                    'Layers ▸', 'Data Layers ▸', 'Compounds ▸', 'Variants ▸', 'Sequence ▸', 'Go to ▸', 'Synthesis cost',
                    'Highlight sequence motif', 'Protein', 'Properties', 'Delete track'];
                const __isTrackItem = (m) => m && __trackItemLabels.indexOf(('' + m.label).trim()) >= 0;
                const __ti = (m) => { const k = __trackItemLabels.indexOf(('' + m.label).trim()); return k < 0 ? 999 : k; };
                track_list = track_list.filter(__isTrackItem).sort((a, b) => __ti(a) - __ti(b))
                    .concat(track_list.filter((m) => !__isTrackItem(m)));
                const __trackMenu = orderMenu(mergePendingSnp(track_list));
                // Render with narrow columns + the track name as a chip outside the menu.
                try { __trackMenu.__compactCols = true; __trackMenu.__menuTitle = (selectedTrack && selectedTrack.name) || 'Track'; } catch (e) { }
                // The track menu is no longer popped up on click. Instead the track is
                // added to the selection box as its own object type; the menu is shown
                // only when the user opens it there (selection box → Tracks → track).
                if (graph.addTrackToSelection) graph.addTrackToSelection(selectedTrack, __trackMenu);
                // Same value as __menuTitle above, so the panel label and the chip agree.
                else graph.showSideMenu(__trackMenu, null, (selectedTrack && selectedTrack.name) || 'Track');
            }

        };

        // Mouse-down only initiates drags/resizes and sets state. It never
        // opens a menu — menus are opened from mouse-up (showContextMenu).
        graph.addMouseDownListener(async (x, y) => {
            md = true;
            graph.__downMenuHandled = false;
            graph.__pendingSnp = null;

            // A menu is open — the click is landing on the menu. Record it so the
            // matching mouse-up also skips (the engine may clear side_menu before
            // the up fires), and don't deselect anything here.
            graph.__downInMenu = !!(graph.side_menu || (graph.menuVisible && graph.menuVisible()));
            if (graph.__downInMenu) return;

            // Click on an off-target COUNT badge → show its statistics popup.
            try {
                const ds = graph.__downScreen;
                if (ds) {
                    for (const t of (graph.track || [])) {
                        for (const o of (t.oligos || [])) {
                            const b = o && o.__otBadge;
                            if (b && ds.x >= b.x && ds.x <= b.x + b.w && ds.y >= b.y && ds.y <= b.y + b.h) {
                                showOffTargetStats(o);
                                return;
                            }
                        }
                    }
                }
            } catch (e) { }

            // Box-zoom owns the interaction — don't let hover select/deselect or
            // clear the selection while the user is dragging a zoom rectangle.
            if (graph.graph && graph.graph.mode === 'bpx') return;

            if (move) {
                move.x = x + diffx;
                move.y = y + diffy;
            }

            if (graph && graph.setCenterParagraph)
                graph.setCenterParagraph(null);

            // Start a resize or a tab-move if the press landed on a plot handle/tab
            for (let pl of graph.plots) {
                const activeTab = pl.inside(graph, x, y);
                if (pl.inResize(graph.X(x), graph.Y(y))) {
                    resize(pl);
                    return;
                } else if (activeTab) {
                    move = pl;
                    return;
                }
            }
            move = null;

            // Start dragging a plot body if the press landed inside it
            for (let plot of graph.plots) {
                if (plot.grid && plot.inside(graph, graph.X(x), graph.Y(y))) {
                    xi = x;
                    yi = y;
                    plot.x = x + (plot.x - x);
                    diffx = (plot.x - x);
                    diffy = (plot.y - y);
                    plot.highlight();
                    move = plot;
                }
            }
            if (move) return;

            // SNP menu on press (moved from mouse-up). Match by proximity across
            // ALL tracks — do NOT gate on getTrack(x, y), otherwise a press that
            // isn't exactly on a track row never runs the SNP hit-test.
            graph.dehighlightAllSnps();
            for (let t of graph.track) {
                for (let s of (t.snpindels || [])) {
                    if (s && s.deselect) s.deselect();
                }
            }
            // No mutation selected yet on this press → clear the "selected mutations pop out" mode
            // (turned back on below if the press lands on a mutation). See snpindel.js draw().
            const __wasSel = graph.__snpSelectionActive;
            graph.__snpSelectionActive = false;
            if (__wasSel) { try { if (graph.wake) graph.wake(); } catch (e) { } }   // ungray on deselect
            // Prefer the screen-space lollipop hit region (getSNPs -> over() -> _hitScreen),
            // which spans the WHOLE lollipop and works even when the stem/head overhangs off
            // the track (zoomed in). Fall back to the proximity model for the zoomed-out view.
            let clickSnp = null, clickTrack = null;
            try {
                const gs = graph.getSNPs(x, y);
                if (gs && gs.length) {
                    clickSnp = gs[0];
                    for (let t of graph.track) { if ((t.snpindels || []).indexOf(clickSnp) >= 0) { clickTrack = t; break; } }
                }
            } catch (e) { }
            if (!clickSnp) {
                for (let t of graph.track) {
                    const xWorld = Math.round(t.tgraph.Xwc(graph.mousex - t.tgraph.xi * 2));
                    const yScreen = graph.Y(y);
                    const snp = t.getClosestSnpindel2D({
                        xWorld, yScreen, graph, selectedTrack: t, maxDistPx: 12, mode: "both"
                    });
                    if (snp) { clickSnp = snp; clickTrack = t; break; }
                }
            }
            if (clickSnp && clickTrack) {
                clickSnp.select();
                // Selected mutation POPS OUT — gray every other mutation (snpindel.js draw()).
                graph.__snpSelectionActive = true;
                // Keep it highlighted: add it to the selection window so the per-frame
                // reassertSelectionHighlights() re-applies its highlight (hover clears highlights
                // every move, which would otherwise drop the spotlight the instant the mouse moves).
                try {
                    const __prev = Array.isArray(graph.__lassoSelection) ? graph.__lassoSelection.filter((e) => e && e.kind !== 'snp') : [];
                    __prev.push({
                        kind: 'snp',
                        label: '' + (clickSnp.name || clickSnp.id || ('snp@' + clickSnp.xi)) + (clickSnp.clinsig ? ' · ' + clickSnp.clinsig : ''),
                        track: clickTrack, chr: clickTrack.chr, xi: clickSnp.xi, xf: (clickSnp.xf != null ? clickSnp.xf : clickSnp.xi),
                        ref: clickSnp, clinsig: clickSnp.clinsig
                    });
                    graph.__lassoSelection = __prev;
                } catch (e) { }
                try { if (graph.wake) graph.wake(); } catch (e) { }
                // Stash the snp menu; mouse-up folds it into the context menu.
                const snpMenu = await exec('baja/manchester/menu/snp-menu', graph, clickTrack, clickSnp);
                graph.__pendingSnp = { label: '' + (clickSnp.name || clickSnp.id || 'SNP'), snpMenu };
            }

            // Select other features of the track pressed (SNP, if any, is merged
            // into the context menu on mouse-up via mergePendingSnp).
            let __selTrackIndex = graph.getTrack(x, y);
            if (__selTrackIndex != null && __selTrackIndex >= 0) {
                let selectedTrack = graph.track[__selTrackIndex];
                if (selectedTrack) {
                    if (!graph.currentShape) {
                        // Preserve the highlighted SEQUENCE selection (markstart/markend) across the
                        // deselect — a plain click on a track must NOT drop the selection the user made.
                        const __savedMarks = (graph.track || []).map((t) => ({ t: t, ms: t.markstart, me: t.markend }));
                        graph.deselectAllTracks();
                        for (const m of __savedMarks) { try { m.t.markstart = m.ms; m.t.markend = m.me; } catch (e) { } }
                    }
                    selectedTrack.select();

                    // Oligos / structures under the cursor
                    let selected_list = selectedTrack.getStructure(x, y);
                    if (selected_list && selected_list.length > 0) {
                        for (let selected of selected_list) {
                            if (selected && selected.select) {
                                if (selected.tgraph && selected.tgraph.xi) {
                                    let xw = selected.tgraph.Xwc(x - selected.tgraph.xi * 2);
                                    let yw = selected.tgraph.Ywc(y - 2 * selected.tgraph?.yi) + 10;
                                    selected.select(xw, yw);
                                } else {
                                    selected.select();
                                }
                            }
                        }
                    }

                    // Clicking an oligo/amplicon adds it to the selection list (same
                    // shape the lasso builds) and opens the selection window. Oligos
                    // and Amplicon objects live in t.oligos, so hit-test that directly
                    // in screen space (getStructure only covers t.structures). Amplicon
                    // span is [left.xi, right.xf] — o.xf is a garbage value for those.
                    try {
                        const cx = graph.X(x), cy = graph.Y(y);
                        for (const o of (selectedTrack.oligos || [])) {
                            const isAmp = (o.type === 'amplicon' && o.left && o.right);
                            const gxi = isAmp ? +o.left.xi : +o.xi;
                            const gxf = isAmp ? +o.right.xf : +o.xf;
                            if (!isFinite(gxi) || !isFinite(gxf)) continue;
                            const sx0 = graph.X(selectedTrack.tgraph.X(gxi));
                            const sx1 = graph.X(selectedTrack.tgraph.X(gxf));
                            const sy = graph.Y(selectedTrack.tgraph.Y(o.y != null ? o.y : 0.1));
                            const lo = Math.min(sx0, sx1) - 4, hi = Math.max(sx0, sx1) + 4;
                            if (cx < lo || cx > hi || Math.abs(cy - sy) > 12) continue;
                            // Pressing on an oligo OR amplicon starts a VERTICAL drag:
                            // select it, stop the pan, and let the move-listener drag it
                            // in Y. A press without movement just selects (below).
                            // (Amplicons draw at this.y and sync left/right.y, so setting
                            // o.y in the move-listener moves the whole amplicon.)
                            if (!graph.__oligoDrag) {
                                graph.__oligoDrag = { o, track: selectedTrack, startY: (o.y != null ? o.y : 0.1), downY: y, moved: false, pushed: false };
                                if (graph.graph) graph.graph.mode = 'move';
                            }
                            if (!graph.__lassoSelection) graph.__lassoSelection = [];
                            if (graph.__lassoSelection.some((e) => e.ref === o)) continue;
                            const origHi = o.highlight__;
                            o.highlight__ = isAmp ? 'cyan' : '#ff8c42';   // tropical orange
                            graph.__lassoSelection.push({
                                kind: isAmp ? 'amplicon' : 'oligo',
                                label: (o.name || o.id || (isAmp ? 'amplicon' : 'oligo')),
                                track: selectedTrack, chr: selectedTrack.chr,
                                xi: gxi, xf: gxf, ref: o,
                                origHighlight: origHi, inOligos: true
                            });
                            graph.showDisplay = true;
                        }
                    } catch (e) { }

                    // Annotations in range under the cursor
                    if (selectedTrack.getAnnotationsInRange) {
                        let xw = selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2);
                        let anns = selectedTrack.getAnnotationsInRange(xw - 1, xw + 1);
                        if (anns) for (let a of anns) {
                            if (a && a.select) a.select();
                            // Add the clicked annotation to the selection box (same shape
                            // the lasso builds), so its options appear under the
                            // Annotations type in the selection window.
                            try {
                                if (a) {
                                    if (!graph.__lassoSelection) graph.__lassoSelection = [];
                                    if (!graph.__lassoSelection.some((e) => e.ref === a)) {
                                        graph.__lassoSelection.push({
                                            kind: 'ann',
                                            label: (a.name || a.type || 'annotation'),
                                            track: selectedTrack, chr: selectedTrack.chr,
                                            xi: a.xi, xf: a.xf, ref: a
                                        });
                                        graph.showDisplay = true;
                                    }
                                }
                            } catch (e) { }
                        }
                    }
                }
            } else {
                // Empty-canvas click — the press landed on no track/item. Clear the
                // lasso selection so the items in the selection window are deselected.
                // Deferred to the next tick so it runs AFTER every mousedown handler
                // (incl. gene.js's control-button / selection-panel handling) has set
                // its flags — otherwise we'd wipe a selection the user just clicked on.
                setTimeout(() => {
                    if (graph.graph && (graph.graph.mode === 'lasso' || graph.graph.mode === 'bpx')) return;   // lasso / box-zoom manage their own
                    if (graph.side_menu || graph.__downMenuHandled || graph.__pendingSnp) return;
                    if (!graph.__lassoSelection || !graph.__lassoSelection.length) return;
                    try { if (graph.clearSelectionVisuals) graph.clearSelectionVisuals(); } catch (e) { }
                    graph.__lassoSelection = [];
                    if (graph.wake) graph.wake();
                }, 0);
            }
        });

        return resolve();

    })

}
