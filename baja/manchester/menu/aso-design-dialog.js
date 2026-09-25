function (kind, targetLength) {

    // Default / Advanced design dialog for SINGLE-STRANDED ASOs — the last interface before the
    // design runs (mirrors the siRNA dialog). `kind` is 'gapmer' or 'steric'. Resolves with the
    // parameters to merge into the design's json_input, or null if the user cancels.
    //   const p = await exec('baja/manchester/menu/aso-design-dialog.js', 'gapmer');
    const K = ('' + (kind || 'gapmer')).toLowerCase();
    const isGapmer = K.indexOf('gap') >= 0;
    // How long the thing being designed against is, when the caller knows. Only used to say
    // what a step will cost in compounds before it is run.
    const TARGET_LEN = (Number.isFinite(+targetLength) && +targetLength > 0) ? Math.floor(+targetLength) : 0;
    const title = isGapmer ? 'Gapmer ASO Design' : 'Steric-blocking ASO Design';

    return new Promise((resolve) => {
        try {
            const old = document.getElementById('baja-aso-design'); if (old && old.parentNode) old.parentNode.removeChild(old);
            const lbl = 'display:block;font:600 12px Arial;color:#9fb3c8;margin:12px 0 4px;';
            const inp = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:8px 10px;font:13px Arial;';
            const panel = document.createElement('div');
            panel.id = 'baja-aso-design';
            // Maximized, like the libraries it sits among and the report the run ends in
            // (baja/lib/shelf.js, design-summary.js). It was a 560px card floating on the
            // canvas, which is the wrong shape for the last decision before a design: the
            // Advanced side is eight fields deep and scrolled inside its own box while most
            // of the screen sat empty behind it.
            //
            // Full-bleed, but the FORM stays a column. Text inputs stretched to the width of
            // a monitor are harder to use, not easier; what the extra room buys is every
            // field visible at once rather than a wider field.
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';

            // Template chemistry options. Gapmer: the WING chemistry (the gap stays DNA). Steric-
            // blocking: the FULL-length chemistry — including PMO (phosphorodiamidate morpholino),
            // which is uniform-morpholino with no PS/PO backbone.
            const wingOptions = isGapmer
                ? ['LNA', "2'-MOE", "2'-OMe", "2'-F", 'cEt']
                : ["2'-MOE", "2'-OMe", 'LNA', "2'-F", 'PMO'];
            const wingSelect = (id, sel) => '<select id="' + id + '" style="' + inp + '">'
                + wingOptions.map((w) => '<option value="' + w + '"' + (w === sel ? ' selected' : '') + '>' + (w === 'PMO' ? 'PMO (morpholino)' : w) + '</option>').join('') + '</select>';

            // ---- backbone: the PS/PO pattern, linkage by linkage --------------------------
            // A phosphorothioate linkage buys nuclease resistance and protein binding; a
            // phosphodiester one is cleaner but bare. Which linkage is which is a design
            // decision, so it is editable here rather than being one PS-or-PO switch for the
            // whole strand. The strip has one cell per LINKAGE, so an n-mer has n-1 of them,
            // 5' to 3'. A pattern shorter than the oligo carries its last linkage to the 3'
            // end, which is what lets one pattern serve a range of lengths.
            const backboneEditor = () => ''
                + '<label style="' + lbl + '">Backbone (PS/PO) pattern</label>'
                + '<div style="background:#0a1e3a;border:1px solid rgba(255,255,255,0.16);border-radius:10px;padding:12px;">'
                + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">'
                + '<div style="flex:1;min-width:190px;"><label style="font:600 11px Arial;color:#9fb3c8;">Pattern</label>'
                + '<select id="ad-bb-preset" style="' + inp + '">'
                + '<option value="all-ps">Uniform PS (every linkage)</option>'
                + '<option value="all-po">Uniform PO (every linkage)</option>'
                + '<option value="wing-ps">PS ends, PO in the middle</option>'
                + '<option value="alt">Alternating PS/PO</option>'
                + '<option value="custom">Custom</option>'
                + '</select></div>'
                + '<div id="ad-bb-wingwrap" style="width:130px;display:none;"><label style="font:600 11px Arial;color:#9fb3c8;">PS at each end</label>'
                + '<input id="ad-bb-wing" type="number" min="1" max="12" value="5" style="' + inp + '"/></div>'
                + '<div style="width:130px;"><label style="font:600 11px Arial;color:#9fb3c8;">Shown for length</label>'
                + '<select id="ad-bb-len" style="' + inp + '"></select></div>'
                + '</div>'
                + '<div id="ad-bb-strip" style="display:flex;flex-wrap:wrap;gap:4px;margin:12px 0 6px;"></div>'
                + '<div style="font:11.5px Arial;color:#9fb3c8;">Click a linkage to switch it between PS and PO. Between base 1 and base 2 is linkage 1, 5\u2032 to 3\u2032.</div>'
                + '<div style="display:flex;gap:10px;align-items:flex-end;margin-top:10px;">'
                + '<div style="flex:1;"><label style="font:600 11px Arial;color:#9fb3c8;">Written pattern (S = PS, O = PO)</label>'
                + '<input id="ad-bb-text" style="' + inp + 'font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:1px;"/></div>'
                + '</div>'
                + '<div id="ad-bb-note" style="font:11.5px Arial;color:#9fb3c8;margin-top:8px;"></div>'
                + '</div>';

            // Header in the same navy language as every other maximized surface, with the two
            // actions in it rather than at the foot of a scrolling form -- where Run design
            // would have been below the fold on the Advanced side.
            panel.innerHTML = ''
                + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
                + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);'
                + 'box-shadow:0 6px 20px rgba(0,0,0,0.35);">'
                + '<div style="min-width:0;"><div style="font:700 20px Arial;">' + title + '</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">Choose Default, or Advanced to tune the design algorithm.</div></div>'
                + '<div style="margin-left:auto;display:flex;gap:10px;">'
                + '<button id="ad-cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Cancel</button>'
                + '<button id="ad-run" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 12.5px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">Run design</button>'
                + '</div></div>'
                + '<div style="flex:1 1 auto;overflow:auto;padding:24px 22px 32px;">'
                + '<div style="width:100%;max-width:640px;margin:0 auto;">'
                + '<div style="display:inline-flex;background:#0a1e3a;border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:3px;">'
                + '<button id="ad-default" style="cursor:pointer;border:0;border-radius:999px;padding:6px 16px;font:700 12px Arial;background:#22c55e;color:#04210f;">Default</button>'
                + '<button id="ad-advanced" style="cursor:pointer;border:0;border-radius:999px;padding:6px 16px;font:700 12px Arial;background:transparent;color:#fff;">Advanced</button>'
                + '</div>'
                // HOW THE ANSWER IS CHOSEN, which is a different question from how it is
                // scored and a different one again from the chemistry. Rule-based ranks every
                // candidate and hands back the best sites anywhere in the target. Tiling walks
                // the target and hands back one at every step along it. They answer different
                // questions -- "which ASO should I make" and "what does this transcript do to
                // an ASO everywhere along it" -- and ranking cannot give you the second,
                // because the good sites cluster and the stretches between them are exactly
                // what a walk is for.
                + (isGapmer
                    ? ('<label style="' + lbl + '">Design strategy</label>'
                        + '<div style="display:inline-flex;background:#0a1e3a;border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:3px;">'
                        + '<button id="ad-strat-rules" style="cursor:pointer;border:0;border-radius:999px;padding:6px 16px;font:700 12px Arial;background:#22c55e;color:#04210f;">Rule-based</button>'
                        + '<button id="ad-strat-tile" style="cursor:pointer;border:0;border-radius:999px;padding:6px 16px;font:700 12px Arial;background:transparent;color:#fff;">Tiling</button>'
                        + '</div>'
                        + '<div id="ad-strat-note" style="font:11.5px Arial;color:#9fb3c8;margin-top:6px;">Every candidate is scored and the best non-overlapping sites across the target are returned, best first.</div>'
                        + '<div id="ad-tilewrap" style="display:none;margin-top:12px;">'
                        + '<label style="font:600 11px Arial;color:#9fb3c8;">Step along the target</label>'
                        + '<select id="ad-tilestep" style="' + inp + '">'
                        + '<option value="1">Every base (1 nt)</option>'
                        + '<option value="3">Every 3 bases</option>'
                        + '<option value="5">Every 5 bases</option>'
                        + '<option value="10">Every 10 bases</option>'
                        + '<option value="0" selected>End to end (no overlap, no gap)</option>'
                        + '<option value="custom">Custom…</option>'
                        + '</select>'
                        + '<div id="ad-tilecustomwrap" style="display:none;margin-top:8px;">'
                        + '<label style="font:600 11px Arial;color:#9fb3c8;">Custom step (bases)</label>'
                        + '<input id="ad-tilecustom" type="number" min="1" max="500" value="7" style="' + inp + '"/></div>'
                        + '<div id="ad-tileest" style="font:11.5px Arial;color:#9fb3c8;margin-top:8px;"></div>'
                        + '</div>')
                    : '')
                + '<label style="' + lbl + '" id="ad-topn-label">Maximum candidates</label>'
                + '<input id="ad-topn" type="number" min="1" max="20000" value="100" style="' + inp + '"/>'
                // THE TRACK'S OWN ALLELE, AND THE OTHER TRACKS' VARIANTS.
                //
                // Two separate questions about the same workbench. The first is what to design
                // AGAINST: the reference the track was built from, or the sequence this sample
                // actually carries. The second is what to design AROUND: a site that is a
                // variant on another track is a site whose sequence is not the same in every
                // sample, and an oligo that lands on one will behave differently in each.
                + '<label style="font:13px Arial;color:#e8f0fb;display:flex;align-items:center;gap:8px;margin-top:12px;"><input type="checkbox" id="ad-allele"/> Design against this track\'s alleles</label>'
                + '<div style="font:11.5px Arial;color:#9fb3c8;margin:4px 0 0 26px;">The track\'s own substitutions are applied to the sequence first, so the oligos match what this sample carries rather than the reference. Indels are left alone: they shift everything downstream and a design built on a guessed frame is worse than none.</div>'
                + '<label style="font:13px Arial;color:#e8f0fb;display:flex;align-items:center;gap:8px;margin-top:12px;"><input type="checkbox" id="ad-avoid"/> Avoid sites carrying variants on other tracks</label>'
                + '<div style="font:11.5px Arial;color:#9fb3c8;margin:4px 0 0 26px;">Every variant on every other track of this workbench is mapped onto this one, and no candidate is allowed to overlap one. What comes back binds the same sequence in all of them.</div>'

                // Default mode takes every parameter out of the user's hands, which is the point
                // of it, and used to leave them with no way to see what it chose -- the Advanced
                // tab at least showed the numbers. The rules go here, where the choice is made.
                + '<div id="ad-doc"></div>'
                + '<div id="ad-adv" style="display:none;">'
                + '<label style="' + lbl + '">ASO lengths (nt, comma-separated)</label>'
                + '<input id="ad-lengths" value="' + (isGapmer ? '16,17,18,19,20' : '18,19,20') + '" style="' + inp + '"/>'
                + (isGapmer
                    ? ('<label style="' + lbl + '">Gap sizes (comma-separated)</label>'
                        + '<input id="ad-gaps" value="8,9,10" style="' + inp + '"/>'
                        + '<label style="' + lbl + '">Template chemistry</label>' + wingSelect('ad-wing', 'LNA')
                        + backboneEditor())
                    : ('<label style="' + lbl + '">Template chemistry</label>' + wingSelect('ad-wing', "2'-MOE")
                        + backboneEditor()))
                + '<label style="' + lbl + '">Output alphabet</label>'
                + '<select id="ad-alpha" style="' + inp + '"><option value="DNA">DNA</option><option value="RNA">RNA</option></select>'
                + '<label style="font:13px Arial;color:#e8f0fb;display:flex;align-items:center;gap:8px;margin-top:12px;"><input type="checkbox" id="ad-overlap"/> Include overlapping layouts of the same site</label>'
                + '<div style="font:11.5px Arial;color:#9fb3c8;margin:4px 0 0 26px;">Off, the design walks the ranking and takes one candidate per site, so it spans the transcript. On, it returns the global top N, which is mostly the same few sites at different lengths and gap sizes.</div>'
                + '</div>'
                + '</div></div>';
            document.body.appendChild(panel);

            const q = (id) => panel.querySelector(id);
            const parseList = (s, d) => { try { const a = ('' + s).split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0); return a.length ? a : d; } catch (e) { return d; } };
            let mode = 'default';
            // Declared up here, not beside its buttons: fillDoc() reads it, and a `let` read
            // before its declaration throws even through typeof.
            let strategy = 'rules';
            // Fetched once, on the first switch into Default, and reused after that.
            // Cached PER STRATEGY: the document's selection sentence differs between them, and
            // one cache would have shown whichever was asked for first.
            const docHtml = {};
            const fillDoc = async () => {
                try {
                    const key = (strategy === 'tile') ? 'tile' : 'rules';
                    if (docHtml[key] == null) {
                        docHtml[key] = await exec('baja/manchester/menu/design-rules-doc.js', K, key);
                    }
                    q('#ad-doc').innerHTML = docHtml[key] || '';
                } catch (e) { try { q('#ad-doc').innerHTML = ''; } catch (e2) { } }
            };
            const setMode = (m) => {
                mode = m;
                // The document is what Default HAS to say; in Advanced the fields say it, and
                // showing both would be the same information twice with the reader left to
                // work out which one is in force.
                q('#ad-doc').style.display = (m === 'default') ? 'block' : 'none';
                if (m === 'default') fillDoc();
                q('#ad-adv').style.display = (m === 'advanced') ? 'block' : 'none';
                q('#ad-default').style.background = (m === 'default') ? '#22c55e' : 'transparent';
                q('#ad-default').style.color = (m === 'default') ? '#04210f' : '#fff';
                q('#ad-advanced').style.background = (m === 'advanced') ? '#22c55e' : 'transparent';
                q('#ad-advanced').style.color = (m === 'advanced') ? '#04210f' : '#fff';
            };
            // ---- backbone editor behaviour ------------------------------------------------
            // `pattern` is the single source of truth: an array of 'S' / 'O', one per linkage.
            // The preset writes it, the strip and the text field edit it, and Run design reads
            // it. The displayed length only decides how much of it is on screen.
            let pattern = [];
            const defLengths = isGapmer ? [16, 17, 18, 19, 20] : [18, 19, 20];
            const lengthsNow = () => parseList(q('#ad-lengths') ? q('#ad-lengths').value : '', defLengths);
            const shownLength = () => {
                const sel = q('#ad-bb-len');
                const v = sel ? parseInt(sel.value, 10) : NaN;
                if (Number.isFinite(v) && v > 1) return v;
                const ls = lengthsNow();
                return ls[ls.length - 1] || 20;
            };
            const presetPattern = (kindOfPattern, n) => {
                const links = Math.max(1, n - 1);
                const wing = Math.max(1, Math.min(12, parseInt(q('#ad-bb-wing') ? q('#ad-bb-wing').value : 5, 10) || 5));
                const a = [];
                for (let i = 0; i < links; i++) {
                    if (kindOfPattern === 'all-po') a.push('O');
                    else if (kindOfPattern === 'alt') a.push(i % 2 === 0 ? 'S' : 'O');
                    else if (kindOfPattern === 'wing-ps') a.push((i < wing || i >= links - wing) ? 'S' : 'O');
                    else a.push('S');
                }
                return a;
            };
            const fitPattern = (n) => {
                const links = Math.max(1, n - 1);
                if (!pattern.length) pattern = presetPattern('all-ps', n);
                while (pattern.length < links) pattern.push(pattern[pattern.length - 1] || 'S');
                return pattern.slice(0, links);
            };
            const drawStrip = () => {
                const n = shownLength();
                const shown = fitPattern(n);
                const strip = q('#ad-bb-strip');
                if (!strip) return;
                strip.innerHTML = shown.map((c, i) => {
                    const on = c === 'S';
                    return '<button type="button" class="ad-bb-cell" data-i="' + i + '" title="Linkage ' + (i + 1) + ' of ' + shown.length + '"'
                        + ' style="cursor:pointer;width:30px;height:34px;border-radius:7px;font:700 12px Arial;'
                        + 'border:1px solid ' + (on ? '#22c55e' : 'rgba(255,255,255,0.28)') + ';'
                        + 'background:' + (on ? 'rgba(34,197,94,0.22)' : 'transparent') + ';color:' + (on ? '#bbf7d0' : '#9fb3c8') + ';">'
                        + (on ? 'S' : 'O') + '</button>';
                }).join('');
                strip.querySelectorAll('.ad-bb-cell').forEach((b) => {
                    b.onclick = () => {
                        const i = +b.getAttribute('data-i');
                        pattern[i] = pattern[i] === 'S' ? 'O' : 'S';
                        if (q('#ad-bb-preset')) q('#ad-bb-preset').value = 'custom';
                        syncFromPattern();
                    };
                });
                const ps = shown.filter((c) => c === 'S').length;
                const note = q('#ad-bb-note');
                if (note) {
                    const ls = lengthsNow();
                    note.innerHTML = shown.length + ' linkages for a ' + n + '-mer: ' + ps + ' PS, ' + (shown.length - ps) + ' PO.'
                        + (ls.length > 1 ? ' Lengths ' + ls.join(', ') + ' each take this pattern from the 5\u2032 end, the last linkage carrying on where the oligo is longer.' : '');
                }
            };
            const syncFromPattern = () => {
                const t = q('#ad-bb-text');
                if (t) t.value = fitPattern(shownLength()).join('');
                drawStrip();
            };
            const fillLengths = () => {
                const sel = q('#ad-bb-len');
                if (!sel) return;
                const ls = lengthsNow();
                const keep = parseInt(sel.value, 10);
                sel.innerHTML = ls.map((n) => '<option value="' + n + '">' + n + ' nt</option>').join('');
                sel.value = (ls.indexOf(keep) >= 0 ? keep : ls[ls.length - 1]);
            };
            const applyPreset = () => {
                const sel = q('#ad-bb-preset');
                const kindOfPattern = sel ? sel.value : 'all-ps';
                if (q('#ad-bb-wingwrap')) q('#ad-bb-wingwrap').style.display = (kindOfPattern === 'wing-ps') ? 'block' : 'none';
                if (kindOfPattern === 'custom') { syncFromPattern(); return; }
                pattern = presetPattern(kindOfPattern, shownLength());
                syncFromPattern();
            };
            if (q('#ad-bb-preset')) {
                fillLengths();
                applyPreset();
                q('#ad-bb-preset').onchange = applyPreset;
                if (q('#ad-bb-wing')) q('#ad-bb-wing').oninput = () => { if (q('#ad-bb-preset').value === 'wing-ps') applyPreset(); };
                q('#ad-bb-len').onchange = () => syncFromPattern();
                if (q('#ad-lengths')) q('#ad-lengths').addEventListener('input', () => { fillLengths(); syncFromPattern(); });
                q('#ad-bb-text').oninput = () => {
                    const raw = ('' + q('#ad-bb-text').value).toUpperCase().replace(/[^SO01*.]/g, '');
                    const a = raw.split('').map((c) => (c === 'S' || c === '1' || c === '*') ? 'S' : 'O');
                    if (!a.length) return;
                    pattern = a;
                    if (q('#ad-bb-preset')) q('#ad-bb-preset').value = 'custom';
                    drawStrip();
                };
            }

            // ---- design strategy ----------------------------------------------------------
            const tileStepNow = () => {
                const sel = q('#ad-tilestep');
                if (!sel) return 0;
                if (sel.value === 'custom') {
                    const v = parseInt(q('#ad-tilecustom') ? q('#ad-tilecustom').value : '', 10);
                    return (Number.isFinite(v) && v > 0) ? Math.min(500, v) : 1;
                }
                return Math.max(0, parseInt(sel.value, 10) || 0);
            };
            const showTileEstimate = () => {
                const el = q('#ad-tileest');
                if (!el) return;
                const step = tileStepNow();
                const ls = lengthsNow();
                const len = ls.length ? Math.max.apply(null, ls) : 20;
                if (!TARGET_LEN) {
                    el.textContent = step > 0
                        ? ('One ASO every ' + step + ' base' + (step === 1 ? '' : 's') + ' along the target.')
                        : 'Each ASO starts one base after the previous one ends, so the target is covered once.';
                    return;
                }
                // End to end steps by the oligo, so the count is the target over its length.
                const per = step > 0 ? step : len;
                const n = Math.max(1, Math.floor((TARGET_LEN - len) / per) + 1);
                // WHAT IT COSTS, SAID BEFORE IT IS RUN. A one-base walk over a transcript is
                // thousands of compounds on one track -- a legitimate thing to order, and not
                // something anyone should discover by watching them land.
                const big = n > 500;
                el.innerHTML = 'About <b>' + n.toLocaleString() + '</b> ASO' + (n === 1 ? '' : 's')
                    + ' across ' + TARGET_LEN.toLocaleString() + ' nt'
                    + (step > 0 ? (', one every ' + step + ' base' + (step === 1 ? '' : 's')) : ', end to end')
                    + '. Raise the maximum below if you want all of them.'
                    + (big ? ('<br><span style="color:#fbbf24;">That is a large panel to put on a single '
                        + 'track, and it will take a while to design and to draw. A wider step, or a '
                        + 'selected region rather than the whole transcript, is the usual first pass.</span>') : '');
            };
            const setStrategy = (v) => {
                strategy = v;
                const tiling = (v === 'tile');
                const on = q('#ad-strat-tile'), off = q('#ad-strat-rules');
                if (on && off) {
                    on.style.background = tiling ? '#22c55e' : 'transparent';
                    on.style.color = tiling ? '#04210f' : '#fff';
                    off.style.background = tiling ? 'transparent' : '#22c55e';
                    off.style.color = tiling ? '#fff' : '#04210f';
                }
                const wrap = q('#ad-tilewrap'); if (wrap) wrap.style.display = tiling ? 'block' : 'none';
                const note = q('#ad-strat-note');
                if (note) {
                    note.textContent = tiling
                        ? 'One ASO at every step along the target, each the best layout that starts there. The scores come back with them, to read rather than to select on — this is the walk you order to test a transcript, not the shortlist you order to pick a compound.'
                        : 'Every candidate is scored and the best non-overlapping sites across the target are returned, best first.';
                }
                // A walk wants room. 100 is the right cap for a shortlist and the wrong one
                // for a tiling, which is not a shortlist at all.
                const lab = q('#ad-topn-label'), topn = q('#ad-topn');
                if (lab) lab.textContent = tiling ? 'Maximum tiles' : 'Maximum candidates';
                if (topn && tiling && (parseInt(topn.value, 10) || 0) <= 100) topn.value = '2000';
                if (topn && !tiling && (parseInt(topn.value, 10) || 0) > 1000) topn.value = '100';
                // Overlap between layouts of one site is the ranked design's question; the
                // step is what decides overlap in a tiling.
                const ov = q('#ad-overlap');
                if (ov && ov.parentElement) ov.parentElement.style.display = tiling ? 'none' : '';
                if (tiling) showTileEstimate();
                if (mode === 'default') fillDoc();
            };
            if (q('#ad-strat-rules')) {
                q('#ad-strat-rules').onclick = () => setStrategy('rules');
                q('#ad-strat-tile').onclick = () => setStrategy('tile');
                q('#ad-tilestep').onchange = () => {
                    const custom = q('#ad-tilestep').value === 'custom';
                    q('#ad-tilecustomwrap').style.display = custom ? 'block' : 'none';
                    showTileEstimate();
                };
                if (q('#ad-tilecustom')) q('#ad-tilecustom').addEventListener('input', showTileEstimate);
                if (q('#ad-lengths')) q('#ad-lengths').addEventListener('input', showTileEstimate);
            }

            fillDoc();
            q('#ad-default').onclick = () => setMode('default');
            q('#ad-advanced').onclick = () => setMode('advanced');
            const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
            q('#ad-cancel').onclick = () => { close(); resolve(null); };
            q('#ad-run').onclick = () => {
                // Clicking Run design dismisses any on-canvas menus (side + center). This dialog has
                // no graph handle, so reach the live graph through the stashed layout.
                try {
                    const g = (typeof CurrentLayout !== 'undefined' && CurrentLayout.getStashed) ? CurrentLayout.getStashed('graph') : null;
                    if (g) { try { if (g.showSideMenu) g.showSideMenu(null); } catch (e) { } g.menu = null; if (g.graph) g.graph.menu = null; if (g.wake) g.wake(); }
                } catch (e) { }
                const tiling = (strategy === 'tile');
                const topn = Math.max(1, Math.min(tiling ? 20000 : 1000, parseInt(q('#ad-topn').value, 10) || 100));
                let params = { top_n: topn, design_mode: tiling ? 'tile' : 'rules' };
                if (tiling) {
                    params.tile_step = tileStepNow();       // 0 = end to end
                    // The step decides the overlap in a tiling; the ranked design's
                    // one-per-site rule has nothing to say about it.
                    params.enforce_non_overlapping = false;
                }
                if (mode === 'advanced') {
                    params.lengths = parseList(q('#ad-lengths').value, isGapmer ? [16, 17, 18, 19, 20] : [18, 19, 20]);
                    if (isGapmer) { params.gap_sizes = parseList(q('#ad-gaps').value, [8, 9, 10]); }
                    params.wing_modification = q('#ad-wing') ? q('#ad-wing').value : (isGapmer ? 'LNA' : "2'-MOE");
                    params.chemistry_template = params.wing_modification;
                    // The pattern itself, plus the two older parameters derived from it so a
                    // design that only reads those still behaves: the majority linkage as the
                    // default, and the PO positions that differ from it.
                    const pat = fitPattern(shownLength());
                    const ps = pat.filter((c) => c === 'S').length;
                    params.backbone_pattern = pat.join('');
                    params.default_backbone = (ps >= pat.length - ps) ? 'PS' : 'PO';
                    params.po_link_positions = pat.map((c, i) => (c === 'O' ? i + 1 : 0)).filter((n) => n > 0);
                    params.backbone_pattern_length = shownLength();
                    params.output_alphabet = q('#ad-alpha') ? q('#ad-alpha').value : 'DNA';
                    // The checkbox asks the opposite question now: ticking it opts INTO the
                    // overlapping layouts, which is the exception rather than the default.
                    if (!tiling) params.enforce_non_overlapping = !(q('#ad-overlap') && q('#ad-overlap').checked);
                }
                // Asked on both tabs: they are about the workbench, not about the chemistry,
                // so a Default-tab run can use them without going through Advanced.
                params.use_track_alleles = !!(q('#ad-allele') && q('#ad-allele').checked);
                params.avoid_other_track_variants = !!(q('#ad-avoid') && q('#ad-avoid').checked);
                close(); resolve(params);
            };
        } catch (e) { resolve(null); }
    });
}
