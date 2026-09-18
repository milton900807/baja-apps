function (kind) {

    // Default / Advanced design dialog for SINGLE-STRANDED ASOs — the last interface before the
    // design runs (mirrors the siRNA dialog). `kind` is 'gapmer' or 'steric'. Resolves with the
    // parameters to merge into the design's json_input, or null if the user cancels.
    //   const p = await exec('baja/manchester/menu/aso-design-dialog.js', 'gapmer');
    const K = ('' + (kind || 'gapmer')).toLowerCase();
    const isGapmer = K.indexOf('gap') >= 0;
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
                + '<label style="' + lbl + '">Maximum candidates</label>'
                + '<input id="ad-topn" type="number" min="1" max="1000" value="100" style="' + inp + '"/>'
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
            // Fetched once, on the first switch into Default, and reused after that.
            let docHtml = null;
            const fillDoc = async () => {
                try {
                    if (docHtml == null) {
                        docHtml = await exec('baja/manchester/menu/design-rules-doc.js', K);
                    }
                    q('#ad-doc').innerHTML = docHtml || '';
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
                const topn = Math.max(1, Math.min(1000, parseInt(q('#ad-topn').value, 10) || 100));
                let params = { top_n: topn };
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
                    params.enforce_non_overlapping = !(q('#ad-overlap') && q('#ad-overlap').checked);
                }
                close(); resolve(params);
            };
        } catch (e) { resolve(null); }
    });
}
