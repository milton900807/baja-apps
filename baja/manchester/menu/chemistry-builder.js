function (kind, preset) {

    // BUILD A COMPOUND'S CHEMISTRY, residue by residue and linkage by linkage.
    //   const chem = await exec('baja/manchester/menu/chemistry-builder.js', 'steric');
    //   // -> { type, name, length, template, shapeFunction } or null if cancelled
    //
    // The two canned templates this replaced were the two that happened to be written out
    // elsewhere in the codebase. Everything here comes from the alias tables in
    // baja/chem/biopolymer.js instead, which is where the app decides what a sugar or a
    // linkage IS: seven sugars (2'-MOE, 2'-OMe, 2'-F, LNA, cEt, DNA, RNA) and two linkages
    // (PS, PO). Each of the nine is a real symbol in the monomer library, checked rather
    // than assumed, so nothing here can emit a monomer the drawing cannot render.
    //
    // The backbone is edited LINKAGE BY LINKAGE, not as one PS-or-PO switch, because that is
    // the decision being made: PS buys nuclease resistance and protein binding, PO is cleaner
    // but bare, and which linkage is which is a design choice rather than a property of the
    // whole strand. An n-mer has n-1 of them.
    //
    // The template is shown as it is built. It is what the rest of the app actually consumes,
    // so a chemistry that looks right in the picture and wrong in the string is a thing worth
    // being able to see.
    const K = ('' + (kind || 'steric')).toLowerCase();
    const isGapmer = K.indexOf('gap') >= 0;

    return new Promise((resolve) => {
        try {
            const old = document.getElementById('baja-chem-build');
            if (old && old.parentNode) old.parentNode.removeChild(old);

            // Canonical symbol -> what a chemist calls it. The symbols are the ones
            // biopolymer.js's alias table resolves TO, so they need no aliasing here.
            const SUGARS = [
                ['moe', "2'-MOE"], ['m', "2'-OMe"], ['fl2r', "2'-F"],
                ['lna', 'LNA'], ['cet', 'cEt'], ['d', 'DNA'], ['r', 'RNA']
            ];
            const SUGAR_COLOR = {
                moe: '#e0a33b', m: '#c98bd8', fl2r: '#6ec1e4',
                lna: '#7fdca0', cet: '#f08b6a', d: '#9fb3c8', r: '#4fd0e6'
            };

            const P = preset || {};
            let len = Math.max(8, Math.min(40, Math.floor(+P.length || (isGapmer ? 20 : 20))));
            let arch = (P.arch === 'uniform' || P.arch === 'gapmer') ? P.arch : (isGapmer ? 'gapmer' : 'uniform');
            let wingChem = P.wingChem || 'moe';
            let gapChem = P.gapChem || 'd';
            let wing = Math.max(1, Math.min(10, Math.floor(+P.wing || 5)));
            // One entry per LINKAGE, so n-1 of them. Rebuilt, not reset, when the length
            // changes: a backbone someone has just edited should survive a 20 -> 19.
            let links = [];
            const fitLinks = () => {
                const want = Math.max(0, len - 1);
                while (links.length < want) links.push(links.length ? links[links.length - 1] : 'sp');
                links.length = want;
            };
            fitLinks();

            // The per-residue sugar, from the architecture. A gap wider than the strand is
            // not expressible, so the wings are clamped rather than allowed to overlap.
            const sugars = () => {
                const out = [];
                if (arch === 'uniform') {
                    for (let i = 0; i < len; i++) out.push(wingChem);
                    return out;
                }
                const w = Math.max(0, Math.min(wing, Math.floor((len - 1) / 2)));
                for (let i = 0; i < len; i++) {
                    out.push((i < w || i >= len - w) ? wingChem : gapChem);
                }
                return out;
            };
            const gapSize = () => (arch === 'uniform') ? 0
                : (len - 2 * Math.max(0, Math.min(wing, Math.floor((len - 1) / 2))));

            // residue()linkage. ... residue() -- the grammar baja/chem/aso-editor.js uses.
            const template = () => {
                const s = sugars();
                const parts = [];
                for (let i = 0; i < len; i++) {
                    parts.push(s[i] + '()');
                    if (i < len - 1) parts.push((links[i] || 'sp') + '.');
                }
                return parts.join('');
            };
            const nameOf = () => {
                const label = (k) => (SUGARS.find((x) => x[0] === k) || [k, k])[1];
                const ps = links.filter((l) => l === 'sp').length;
                const back = (ps === links.length) ? 'full PS'
                    : (ps === 0 ? 'full PO' : (ps + '/' + links.length + ' PS'));
                return (arch === 'uniform')
                    ? ('Uniform ' + label(wingChem) + ', ' + back + ' (' + len + ' nt)')
                    : (label(wingChem) + ' ' + Math.min(wing, Math.floor((len - 1) / 2)) + '-'
                        + gapSize() + '-' + Math.min(wing, Math.floor((len - 1) / 2))
                        + ' ' + label(gapChem) + ' gap, ' + back + ' (' + len + ' nt)');
            };

            const lbl = 'display:block;font:600 12px Arial;color:#9fb3c8;margin:14px 0 5px;';
            const inp = 'box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;'
                + 'border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:8px 10px;font:13px Arial;';
            const sel = (id, opts, cur) => '<select id="' + id + '" style="' + inp + 'width:100%;max-width:280px;">'
                + opts.map((o) => '<option value="' + o[0] + '"' + (o[0] === cur ? ' selected' : '') + '>'
                    + o[1] + '</option>').join('') + '</select>';
            const btn = (id, label, on) => '<button id="' + id + '" style="cursor:pointer;border-radius:8px;'
                + 'padding:7px 13px;font:700 12.5px Arial;border:1px solid '
                + (on ? '#22c55e;background:#22c55e;color:#04210f;' : 'rgba(255,255,255,0.28);background:transparent;color:#e8f0fb;')
                + '">' + label + '</button>';

            const panel = document.createElement('div');
            panel.id = 'baja-chem-build';
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
            panel.innerHTML =
                '<div style="padding:18px 24px 12px;border-bottom:1px solid rgba(255,255,255,0.12);">'
                + '<div style="font:700 17px Arial;">Compound chemistry</div>'
                + '<div id="cb-name" style="font:12.5px Arial;color:#9fb3c8;margin-top:4px;"></div></div>'
                + '<div style="flex:1;overflow:auto;padding:4px 24px 24px;"><div style="max-width:760px;">'

                + '<label style="' + lbl + '">Architecture</label>'
                + '<div style="display:flex;gap:8px;">'
                + btn('cb-uniform', 'Uniform', arch === 'uniform')
                + btn('cb-gapmer', 'Gapmer (wing / gap / wing)', arch === 'gapmer')
                + '</div>'

                + '<label style="' + lbl + '">Length (nt)</label>'
                + '<input id="cb-len" type="number" min="8" max="40" value="' + len + '" style="' + inp + 'width:120px;"/>'

                + '<div id="cb-uni" style="display:' + (arch === 'uniform' ? '' : 'none') + ';">'
                + '<label style="' + lbl + '">Chemistry, whole strand</label>' + sel('cb-chem-u', SUGARS, wingChem)
                + '</div>'

                + '<div id="cb-gap" style="display:' + (arch === 'gapmer' ? '' : 'none') + ';">'
                + '<label style="' + lbl + '">Wing chemistry</label>' + sel('cb-chem-w', SUGARS, wingChem)
                + '<label style="' + lbl + '">Gap chemistry</label>' + sel('cb-chem-g', SUGARS, gapChem)
                + '<div style="font:11.5px Arial;color:#7f97a6;margin-top:4px;">'
                + 'A DNA gap is what recruits RNase H. A gap of anything else blocks without cleaving.</div>'
                + '<label style="' + lbl + '">Wing size (each side)</label>'
                + '<input id="cb-wing" type="number" min="1" max="10" value="' + wing + '" style="' + inp + 'width:120px;"/>'
                + '<span id="cb-gapsize" style="font:12.5px Arial;color:#9fb3c8;margin-left:10px;"></span>'
                + '</div>'

                + '<label style="' + lbl + '">Backbone, linkage by linkage</label>'
                + '<div style="display:flex;gap:8px;margin-bottom:8px;">'
                + btn('cb-allps', 'All PS') + btn('cb-allpo', 'All PO') + btn('cb-ends', 'PS at the ends only')
                + '</div>'
                + '<div id="cb-links" style="display:flex;flex-wrap:wrap;gap:3px;"></div>'
                + '<div style="font:11.5px Arial;color:#7f97a6;margin-top:6px;">'
                + 'One cell per linkage, 5′ to 3′, so an n-mer has n−1. Click to switch it.</div>'

                + '<label style="' + lbl + '">The strand</label>'
                + '<div id="cb-strip" style="display:flex;flex-wrap:wrap;gap:3px;"></div>'
                + '<div id="cb-legend" style="font:11.5px Arial;color:#7f97a6;margin-top:7px;"></div>'

                + '<label style="' + lbl + '">Template</label>'
                + '<div id="cb-template" style="font:12px ui-monospace,Consolas,monospace;color:#8fe3c0;'
                + 'background:#061627;border:1px solid rgba(255,255,255,0.12);border-radius:8px;'
                + 'padding:10px 12px;word-break:break-all;"></div>'

                + '</div></div>'
                + '<div style="padding:14px 24px;border-top:1px solid rgba(255,255,255,0.12);display:flex;gap:10px;">'
                + '<button id="cb-ok" style="cursor:pointer;border-radius:9px;padding:11px 18px;font:700 13.5px Arial;'
                + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;">Use this chemistry</button>'
                + '<button id="cb-cancel" style="cursor:pointer;border-radius:9px;padding:11px 18px;font:700 13.5px Arial;'
                + 'border:1px solid rgba(255,255,255,0.28);background:transparent;color:#e8f0fb;">Cancel</button>'
                + '</div>';
            document.body.appendChild(panel);

            const q = (s) => panel.querySelector(s);
            const close = () => { try { panel.parentNode.removeChild(panel); } catch (e) { } };

            const draw = () => {
                fitLinks();
                const s = sugars();
                const label = (k) => (SUGARS.find((x) => x[0] === k) || [k, k])[1];

                q('#cb-name').textContent = nameOf();
                q('#cb-template').textContent = template();
                q('#cb-gapsize').textContent = (arch === 'gapmer')
                    ? ('gap ' + gapSize() + ' nt' + (gapSize() < 6 ? '  (short for RNase H)' : '')) : '';

                // The residues, in their own colours, so the architecture is read as a
                // picture and the template underneath is read as the proof of it.
                q('#cb-strip').innerHTML = s.map((k) => '<span title="' + label(k) + '" style="display:inline-block;'
                    + 'min-width:30px;text-align:center;border-radius:5px;padding:4px 5px;font:700 11px Arial;'
                    + 'color:#06243a;background:' + (SUGAR_COLOR[k] || '#9fb3c8') + ';">' + label(k).replace(/^2'-/, '') + '</span>').join('');
                const used = Array.from(new Set(s));
                q('#cb-legend').textContent = used.map((k) => label(k)).join('  ·  ')
                    + '   ·   ' + len + ' residues, ' + links.length + ' linkages';

                q('#cb-links').innerHTML = links.map((l, i) => '<button data-lk="' + i + '" title="linkage '
                    + (i + 1) + '" style="cursor:pointer;min-width:30px;border-radius:5px;padding:4px 5px;'
                    + 'font:700 11px Arial;border:1px solid rgba(255,255,255,0.2);'
                    + (l === 'sp' ? 'background:#1f6f4a;color:#d9ffe9;' : 'background:#0a1e3a;color:#9fb3c8;')
                    + '">' + (l === 'sp' ? 'PS' : 'PO') + '</button>').join('');
                for (const b of panel.querySelectorAll('[data-lk]')) {
                    b.onclick = () => {
                        const i = +b.getAttribute('data-lk');
                        links[i] = (links[i] === 'sp') ? 'p' : 'sp';
                        draw();
                    };
                }
                for (const [id, on] of [['#cb-uniform', arch === 'uniform'], ['#cb-gapmer', arch === 'gapmer']]) {
                    const el = q(id);
                    if (!el) continue;
                    el.style.background = on ? '#22c55e' : 'transparent';
                    el.style.color = on ? '#04210f' : '#e8f0fb';
                    el.style.borderColor = on ? '#22c55e' : 'rgba(255,255,255,0.28)';
                }
                q('#cb-uni').style.display = (arch === 'uniform') ? '' : 'none';
                q('#cb-gap').style.display = (arch === 'gapmer') ? '' : 'none';
            };

            q('#cb-uniform').onclick = () => { arch = 'uniform'; draw(); };
            q('#cb-gapmer').onclick = () => { arch = 'gapmer'; draw(); };
            q('#cb-len').oninput = () => {
                const v = parseInt(q('#cb-len').value, 10);
                if (Number.isFinite(v) && v >= 8 && v <= 40) { len = v; draw(); }
            };
            q('#cb-wing').oninput = () => {
                const v = parseInt(q('#cb-wing').value, 10);
                if (Number.isFinite(v) && v >= 1 && v <= 10) { wing = v; draw(); }
            };
            q('#cb-chem-u').onchange = () => { wingChem = q('#cb-chem-u').value; draw(); };
            q('#cb-chem-w').onchange = () => { wingChem = q('#cb-chem-w').value; draw(); };
            q('#cb-chem-g').onchange = () => { gapChem = q('#cb-chem-g').value; draw(); };
            q('#cb-allps').onclick = () => { links = links.map(() => 'sp'); draw(); };
            q('#cb-allpo').onclick = () => { links = links.map(() => 'p'); draw(); };
            q('#cb-ends').onclick = () => {
                // The common compromise: PS where an exonuclease starts, PO through the
                // middle. Five at each end is the usual shape of it.
                links = links.map((l, i) => (i < 5 || i >= links.length - 5) ? 'sp' : 'p');
                draw();
            };
            q('#cb-cancel').onclick = () => { close(); resolve(null); };
            q('#cb-ok').onclick = () => {
                const chem = {
                    type: 'DNA',
                    name: nameOf(),
                    length: len,
                    template: template(),
                    shapeFunction: 'baja/shapes/myshapefunction.js'
                };
                close();
                resolve(chem);
            };
            draw();
        } catch (e) {
            try { log('chemistry-builder: ' + e); } catch (e2) { }
            resolve(null);
        }
    });
}
