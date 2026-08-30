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
            panel.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:2147483000;width:min(560px,94vw);max-height:86vh;overflow:auto;background:#0b2545;color:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.14);font-family:Arial,Helvetica,sans-serif;padding:18px;';

            // Template chemistry options. Gapmer: the WING chemistry (the gap stays DNA). Steric-
            // blocking: the FULL-length chemistry — including PMO (phosphorodiamidate morpholino),
            // which is uniform-morpholino with no PS/PO backbone.
            const wingOptions = isGapmer
                ? ['LNA', "2'-MOE", "2'-OMe", "2'-F", 'cEt']
                : ["2'-MOE", "2'-OMe", 'LNA', "2'-F", 'PMO'];
            const wingSelect = (id, sel) => '<select id="' + id + '" style="' + inp + '">'
                + wingOptions.map((w) => '<option value="' + w + '"' + (w === sel ? ' selected' : '') + '>' + (w === 'PMO' ? 'PMO (morpholino)' : w) + '</option>').join('') + '</select>';

            panel.innerHTML = ''
                + '<div style="font:700 17px Arial;margin-bottom:2px;">' + title + '</div>'
                + '<div style="font:13px Arial;color:#9fb3c8;margin-bottom:12px;">Choose Default, or Advanced to tune the design algorithm.</div>'
                + '<div style="display:inline-flex;background:#0a1e3a;border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:3px;">'
                + '<button id="ad-default" style="cursor:pointer;border:0;border-radius:999px;padding:6px 16px;font:700 12px Arial;background:#22c55e;color:#04210f;">Default</button>'
                + '<button id="ad-advanced" style="cursor:pointer;border:0;border-radius:999px;padding:6px 16px;font:700 12px Arial;background:transparent;color:#fff;">Advanced</button>'
                + '</div>'
                + '<label style="' + lbl + '">Maximum candidates</label>'
                + '<input id="ad-topn" type="number" min="1" max="1000" value="100" style="' + inp + '"/>'
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
                + '<label style="font:13px Arial;color:#e8f0fb;display:flex;align-items:center;gap:8px;margin-top:12px;"><input type="checkbox" id="ad-nonoverlap"/> Enforce non-overlapping candidates</label>'
                + '</div>'
                + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">'
                + '<button id="ad-cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 13px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Cancel</button>'
                + '<button id="ad-run" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 13px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">Run design</button>'
                + '</div>';
            document.body.appendChild(panel);

            const q = (id) => panel.querySelector(id);
            const parseList = (s, d) => { try { const a = ('' + s).split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0); return a.length ? a : d; } catch (e) { return d; } };
            let mode = 'default';
            const setMode = (m) => {
                mode = m;
                q('#ad-adv').style.display = (m === 'advanced') ? 'block' : 'none';
                q('#ad-default').style.background = (m === 'default') ? '#22c55e' : 'transparent';
                q('#ad-default').style.color = (m === 'default') ? '#04210f' : '#fff';
                q('#ad-advanced').style.background = (m === 'advanced') ? '#22c55e' : 'transparent';
                q('#ad-advanced').style.color = (m === 'advanced') ? '#04210f' : '#fff';
            };
            q('#ad-default').onclick = () => setMode('default');
            q('#ad-advanced').onclick = () => setMode('advanced');
            const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
            q('#ad-cancel').onclick = () => { close(); resolve(null); };
            q('#ad-run').onclick = () => {
                const topn = Math.max(1, Math.min(1000, parseInt(q('#ad-topn').value, 10) || 100));
                let params = { top_n: topn };
                if (mode === 'advanced') {
                    params.lengths = parseList(q('#ad-lengths').value, isGapmer ? [16, 17, 18, 19, 20] : [18, 19, 20]);
                    if (isGapmer) { params.gap_sizes = parseList(q('#ad-gaps').value, [8, 9, 10]); }
                    params.wing_modification = q('#ad-wing') ? q('#ad-wing').value : (isGapmer ? 'LNA' : "2'-MOE");
                    params.chemistry_template = params.wing_modification;
                    params.default_backbone = q('#ad-bb') ? q('#ad-bb').value : 'PS';
                    params.output_alphabet = q('#ad-alpha') ? q('#ad-alpha').value : 'DNA';
                    params.enforce_non_overlapping = !!(q('#ad-nonoverlap') && q('#ad-nonoverlap').checked);
                }
                close(); resolve(params);
            };
        } catch (e) { resolve(null); }
    });
}
