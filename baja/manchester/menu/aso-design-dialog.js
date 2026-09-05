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
                        + '<div style="display:flex;gap:12px;"><div style="flex:1;"><label style="' + lbl + '">Template chemistry</label>' + wingSelect('ad-wing', 'LNA') + '</div>'
                        + '<div style="flex:1;"><label style="' + lbl + '">Backbone</label><select id="ad-bb" style="' + inp + '"><option value="PS">PS (phosphorothioate)</option><option value="PO">PO</option></select></div></div>')
                    : ('<div style="display:flex;gap:12px;"><div style="flex:1;"><label style="' + lbl + '">Template chemistry</label>' + wingSelect('ad-wing', "2'-MOE") + '</div>'
                        + '<div style="flex:1;"><label style="' + lbl + '">Backbone</label><select id="ad-bb" style="' + inp + '"><option value="PS">PS (phosphorothioate)</option><option value="PO">PO</option></select></div></div>'))
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
                    params.default_backbone = q('#ad-bb') ? q('#ad-bb').value : 'PS';
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
