function (graph, layout) {

    // Clinical Library — a bookshelf of clinical RNA-targeting compounds (ASO / siRNA / anti-miR).
    // Each compound is a "book" whose title/spine come from its metadata. Clicking a book loads its
    // sequence into a new track and drops the compound (with per-residue chemistry) on top of it —
    // see manchester/load-clinical-compound.js. Navy demo look-and-feel (a DOM overlay).
    //   exec('manchester/clinical-library.js', graph, layout)

    return (async () => {
        const host = (window['env'] && window['env']['apiUrl']) || window.location.origin;
        const user = (typeof getUser === 'function') ? (getUser() || '') : '';

        // ---- Load the compound manifest -------------------------------------------------
        let compounds = [];
        try {
            compounds = await GETJSON(host + '/load-file?path=/data/clinical/manifest.json&key=wd&user=' + encodeURIComponent(user));
        } catch (e) { compounds = []; }
        if (!Array.isArray(compounds)) compounds = [];

        // Modality → accent color + short badge.
        const modalityOf = (c) => {
            const m = ('' + (c.modality || '')).toLowerCase();
            if (m.indexOf('sirna') >= 0) return { key: 'siRNA', color: '#8b5cf6', badge: 'siRNA' };
            if (m.indexOf('anti-mir') >= 0 || m.indexOf('mirna') >= 0) return { key: 'anti-miR', color: '#e0a83c', badge: 'anti-miR' };
            return { key: 'ASO', color: '#1aa3bd', badge: 'ASO' };
        };
        const esc = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const titleCase = (s) => ('' + (s || '')).replace(/\b([a-z])/g, (m, c) => c.toUpperCase());

        // ---- Overlay panel --------------------------------------------------------------
        try { const old = document.getElementById('baja-clinical-library'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const overlay = document.createElement('div');
        overlay.id = 'baja-clinical-library';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483200;background:#071a30;color:#fff;'
            + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';

        const header = document.createElement('div');
        header.style.cssText = 'flex:0 0 auto;padding:16px 22px;background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);'
            + 'display:flex;align-items:center;gap:16px;box-shadow:0 6px 20px rgba(0,0,0,0.35);';
        header.innerHTML = ''
            + '<div style="display:flex;flex-direction:column;gap:2px;">'
            + '<div style="font:700 19px Arial;">Clinical Compound Library</div>'
            + '<div style="font:12.5px Arial;color:#9fb3c8;">' + compounds.length + ' clinical RNA-targeting compounds — click a compound to load its sequence + chemistry</div>'
            + '</div>'
            + '<input id="cl-search" placeholder="Search name, target, indication…" style="flex:1;max-width:420px;margin-left:auto;'
            + 'background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:9px 16px;font:13px Arial;"/>'
            + '<div id="cl-filters" style="display:flex;gap:6px;"></div>'
            + '<button id="cl-close" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 13px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">✕ Close</button>';

        const shelf = document.createElement('div');
        shelf.id = 'cl-shelf';
        shelf.style.cssText = 'flex:1 1 auto;overflow:auto;padding:22px;display:grid;'
            + 'grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:18px;align-content:start;';

        overlay.appendChild(header);
        overlay.appendChild(shelf);
        document.body.appendChild(overlay);

        const close = () => { try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { } };
        header.querySelector('#cl-close').onclick = close;

        // ---- Modality filter chips ------------------------------------------------------
        let activeModality = 'All';
        const filterWrap = header.querySelector('#cl-filters');
        const mods = ['All', 'ASO', 'siRNA', 'anti-miR'];
        const chipEls = {};
        for (const m of mods) {
            const b = document.createElement('button');
            b.textContent = m;
            b.style.cssText = 'cursor:pointer;border-radius:999px;padding:7px 12px;font:700 12px Arial;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#fff;';
            b.onclick = () => { activeModality = m; for (const k in chipEls) { chipEls[k].style.background = (k === m) ? '#22c55e' : 'transparent'; chipEls[k].style.color = (k === m) ? '#04210f' : '#fff'; } render(); };
            chipEls[m] = b; filterWrap.appendChild(b);
        }
        chipEls['All'].style.background = '#22c55e'; chipEls['All'].style.color = '#04210f';

        // ---- Render the shelf -----------------------------------------------------------
        const bookCard = (c) => {
            const mod = modalityOf(c);
            const name = titleCase(c.name || c.compound_id || 'compound');
            // Target on the cover: prefer a gene SYMBOL (target_gene, or one in parentheses within
            // the target name), else the target name / mechanism.
            const __tg = ('' + (c.target_gene || '')).trim();
            let __tn = ('' + (c.target_name || c.mechanism_of_action || '')).trim();
            let __sym = __tg;
            if (!__sym && __tn) { const __m = __tn.match(/\(([A-Za-z0-9][A-Za-z0-9-]{1,7})\)/); if (__m) __sym = __m[1]; }
            const target = __sym || __tn;
            const phase = (c.max_phase != null && c.max_phase !== '') ? ('Phase ' + (c.max_phase >= 4 ? '4 (approved)' : c.max_phase)) : '';
            const len = c.total_length_nt ? (c.total_length_nt + ' nt') : '';
            const sub = c.aso_subtype || c.architecture || (c.chemistry_summary || '').split(';')[0] || '';

            const card = document.createElement('button');
            card.type = 'button';
            card.style.cssText = 'text-align:left;cursor:pointer;border:0;padding:0;background:transparent;display:flex;flex-direction:column;'
                + 'height:230px;border-radius:10px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.4);transition:transform .12s ease,box-shadow .12s ease;';
            card.onmouseenter = () => { card.style.transform = 'translateY(-3px)'; card.style.boxShadow = '0 12px 26px rgba(0,0,0,0.5)'; };
            card.onmouseleave = () => { card.style.transform = ''; card.style.boxShadow = '0 6px 18px rgba(0,0,0,0.4)'; };
            card.innerHTML = ''
                + '<div style="flex:1;position:relative;background:linear-gradient(135deg,' + mod.color + ' 0%, rgba(0,0,0,0.35) 140%);padding:14px 14px 10px 16px;border-left:5px solid rgba(255,255,255,0.35);">'
                + '<div style="position:absolute;top:10px;right:10px;font:700 10px Arial;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.3);border-radius:999px;padding:3px 8px;">' + esc(mod.badge) + '</div>'
                + '<div style="font:800 15px/1.2 Georgia,\'Times New Roman\',serif;margin-top:26px;word-break:break-word;">' + esc(name) + '</div>'
                + (target ? '<div style="font:12px Arial;color:rgba(255,255,255,0.95);margin-top:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">🎯 ' + esc(target) + '</div>' : '')
                + '</div>'
                + '<div style="flex:0 0 auto;background:#0b2545;padding:9px 12px;border-top:1px solid rgba(255,255,255,0.12);">'
                + '<div style="font:11px Arial;color:#cfe0ee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(sub || mod.key) + '</div>'
                + '<div style="font:10.5px Arial;color:#8fb8c8;margin-top:3px;display:flex;justify-content:space-between;gap:8px;"><span>' + esc(len) + '</span><span>' + esc(phase) + '</span></div>'
                + '</div>';
            card.onclick = () => {
                close();
                try { graph.setCenterMessage && graph.setCenterMessage('Loading ' + name + '…'); } catch (e) { }
                try { exec('manchester/load-clinical-compound.js', graph, layout, c); }
                catch (e) { try { graph.setMessage(' Load failed: ' + (e && e.message ? e.message : e)); } catch (e2) { } }
            };
            return card;
        };

        const render = () => {
            const q = ('' + (header.querySelector('#cl-search').value || '')).trim().toLowerCase();
            shelf.innerHTML = '';
            let shown = 0;
            const list = compounds.slice().sort((a, b) => ('' + (a.name || a.compound_id)).localeCompare('' + (b.name || b.compound_id)));
            for (const c of list) {
                if (activeModality !== 'All' && modalityOf(c).key !== activeModality) continue;
                if (q) {
                    const hay = [c.name, c.compound_id, c.target_gene, c.target_name, c.modality, c.indications, c.aso_subtype, c.architecture].join(' ').toLowerCase();
                    if (hay.indexOf(q) < 0) continue;
                }
                shelf.appendChild(bookCard(c));
                shown++;
            }
            if (!shown) {
                const empty = document.createElement('div');
                empty.style.cssText = 'grid-column:1/-1;color:#8fb8c8;font:14px Arial;padding:40px;text-align:center;';
                empty.textContent = 'No compounds match your search.';
                shelf.appendChild(empty);
            }
        };
        header.querySelector('#cl-search').addEventListener('input', render);
        try { document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape' && document.getElementById('baja-clinical-library')) { e.preventDefault(); close(); document.removeEventListener('keydown', onEsc, true); } }, true); } catch (e) { }

        if (!compounds.length) {
            shelf.innerHTML = '<div style="grid-column:1/-1;color:#e0a83c;font:14px Arial;padding:40px;text-align:center;">Could not load the clinical compound library (data/clinical/manifest.json).</div>';
        } else {
            render();
        }
        return graph;
    })();
}
