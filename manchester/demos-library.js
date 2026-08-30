function (graph, genegraph_panel_layout) {

    // Demos Library — a bookshelf of saved demo/recording scripts (same look & feel as the
    // Clinical Compound Library). Each "book" is a demo script (a JSON array of demo.js
    // commands). Clicking ▶ Play runs it IN-PLACE against the live editor. Books can be
    // created, edited and deleted; the collection is persisted per-browser in localStorage.
    //   exec('manchester/demos-library.js', graph, genegraph_panel_layout)

    return (async () => {
        const LS_KEY = 'baja.demos.v1';

        // First-run seed: the Cemdisiran off-target map & mapper walkthrough.
        const SEED = [{
            id: 'seed-cemdisiran-offtarget',
            name: 'Cemdisiran — off-target map',
            description: 'Load Cemdisiran from the Clinical Library, run full-sequence off-targets on human transcripts, then view & map an off-target transcript.',
            script: [
                { "cmd": "camera", "x0": 0, "x1": 10000, "y0": 1, "y1": -1.5, "ms": 0 },
                { "cmd": "wait", "ms": 3722 },
                { "cmd": "event", "type": "up", "fx": 0.5547, "fy": -0.0814 },
                { "cmd": "domclick", "locator": { "by": "label", "v": "Design", "tag": "button", "path": "div:nth-of-type(1)>card-single>button-menu>div>div>button:nth-of-type(5)", "wx": 0.5547, "wy": 0.0867 } },
                { "cmd": "wait", "ms": 1200 },
                { "cmd": "event", "type": "down", "fx": 0.4969, "fy": 0.4827 },
                { "cmd": "wait", "ms": 127 },
                { "cmd": "event", "type": "up", "fx": 0.4969, "fy": 0.4827 },
                { "cmd": "menuclick", "menu": "center", "label": "Clinical Library" },
                { "cmd": "wait", "ms": 1640 },
                { "cmd": "domclick", "locator": { "by": "label", "v": "clinical-compound:cemdisiran", "tag": "button", "path": "div:nth-of-type(2)>div:nth-of-type(2)>button:nth-of-type(22)", "wx": 0.3802, "wy": 0.7596 } },
                { "cmd": "wait", "ms": 4000 },
                { "cmd": "event", "type": "down", "fx": 0.5047, "fy": 0.3995 },
                { "cmd": "event", "type": "move", "fx": 0.5047, "fy": 0.3956, "extra": 1 },
                { "cmd": "event", "type": "up", "fx": 0.5047, "fy": 0.3956 },
                { "cmd": "event", "type": "up", "fx": 0.5047, "fy": 0.3956 },
                { "cmd": "wait", "ms": 3896 },
                { "cmd": "event", "type": "down", "fx": 0.0266, "fy": 0.1604 },
                { "cmd": "wait", "ms": 143 },
                { "cmd": "event", "type": "up", "fx": 0.0266, "fy": 0.1604 },
                { "cmd": "event", "type": "up", "fx": 0.0266, "fy": 0.1604 },
                { "cmd": "wait", "ms": 1530 },
                { "cmd": "menuclick", "menu": "side", "label": "Selected Oligos (1) ▸" },
                { "cmd": "wait", "ms": 142 },
                { "cmd": "event", "type": "up", "fx": 0.0656, "fy": 0.1942 },
                { "cmd": "wait", "ms": 1257 },
                { "cmd": "menuclick", "menu": "side", "label": "Run off-targets…" },
                { "cmd": "wait", "ms": 151 },
                { "cmd": "event", "type": "up", "fx": 0.0953, "fy": 0.2423 },
                { "cmd": "wait", "ms": 1145 },
                { "cmd": "menuclick", "menu": "side", "label": "Run full sequence" },
                { "cmd": "wait", "ms": 167 },
                { "cmd": "event", "type": "up", "fx": 0.101, "fy": 0.1942 },
                { "cmd": "wait", "ms": 1033 },
                { "cmd": "menuclick", "menu": "side", "label": "Human (5)" },
                { "cmd": "wait", "ms": 136 },
                { "cmd": "event", "type": "up", "fx": 0.0943, "fy": 0.1643 },
                { "cmd": "wait", "ms": 2456 },
                { "cmd": "menuclick", "menu": "side", "label": "human_all_transcripts" },
                { "cmd": "wait", "ms": 128 },
                { "cmd": "event", "type": "up", "fx": 0.1016, "fy": 0.1526 },
                { "cmd": "wait", "ms": 1136 },
                { "cmd": "menuclick", "menu": "side", "label": "Edit distance 0" },
                { "cmd": "wait", "ms": 160 },
                { "cmd": "domclick", "locator": { "by": "path", "v": "html", "tag": "html", "wx": 0.1016, "wy": 0.2854 } },
                { "cmd": "wait", "ms": 2120 },
                { "cmd": "event", "type": "up", "fx": 0.4734, "fy": 0.4463 },
                { "cmd": "domclick", "locator": { "by": "text", "v": "Yes", "tag": "button", "path": "div>card-single>mt-button>section>div>button:nth-of-type(1)", "wx": 0.4734, "wy": 0.5324 } },
                { "cmd": "wait", "ms": 4000 },
                { "cmd": "event", "type": "up", "fx": 0.6401, "fy": 0.4268 },
                { "cmd": "domclick", "locator": { "by": "text", "v": "Close", "tag": "button", "path": "div:nth-of-type(3)>div:nth-of-type(2)>button:nth-of-type(3)", "wx": 0.6401, "wy": 0.5159 } },
                { "cmd": "wait", "ms": 3417 },
                { "cmd": "menuclick", "menu": "side", "label": "View off-targets" },
                { "cmd": "wait", "ms": 159 },
                { "cmd": "event", "type": "up", "fx": 0.112, "fy": 0.5425 },
                { "cmd": "wait", "ms": 4000 },
                { "cmd": "event", "type": "up", "fx": 0.6224, "fy": 0.2202 },
                { "cmd": "domclick", "locator": { "by": "label", "v": "Load this transcript and map the compound onto it", "tag": "button", "path": "div:nth-of-type(3)>div:nth-of-type(3)>div:nth-of-type(3)>button", "wx": 0.6224, "wy": 0.3414 } },
                { "cmd": "wait", "ms": 4000 },
                { "cmd": "event", "type": "up", "fx": 0.9734, "fy": -0.1437 }
            ]
        }];

        const esc = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const uid = () => 'demo-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);

        const load = () => { try { const s = localStorage.getItem(LS_KEY); if (s) { const a = JSON.parse(s); if (Array.isArray(a)) return a; } } catch (e) { } return null; };
        const store = (arr) => { try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch (e) { } };
        let demos = load();
        if (!demos) { demos = SEED.map((d) => Object.assign({}, d)); store(demos); }

        const stepCount = (d) => { try { return Array.isArray(d.script) ? d.script.length : (Array.isArray(JSON.parse(d.script)) ? JSON.parse(d.script).length : 0); } catch (e) { return 0; } }
        const scriptText = (d) => { try { return (typeof d.script === 'string') ? d.script : JSON.stringify(d.script, null, 2); } catch (e) { return '[]'; } };

        // ---- Overlay -------------------------------------------------------------------
        try { const old = document.getElementById('baja-demos-library'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const overlay = document.createElement('div');
        overlay.id = 'baja-demos-library';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483200;background:#071a30;color:#fff;'
            + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';

        const header = document.createElement('div');
        header.style.cssText = 'flex:0 0 auto;padding:16px 22px;background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);'
            + 'display:flex;align-items:center;gap:16px;box-shadow:0 6px 20px rgba(0,0,0,0.35);';
        header.innerHTML = ''
            + '<div style="display:flex;flex-direction:column;gap:2px;">'
            + '<div style="font:700 19px Arial;">Demos</div>'
            + '<div id="dl-count" style="font:12.5px Arial;color:#9fb3c8;"></div>'
            + '</div>'
            + '<input id="dl-search" placeholder="Search demos…" style="flex:1;max-width:360px;margin-left:auto;'
            + 'background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:9px 16px;font:13px Arial;"/>'
            + '<button id="dl-new" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 13px Arial;border:none;background:#22c55e;color:#04210f;">+ New demo</button>'
            + '<button id="dl-close" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 13px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">✕ Close</button>';

        const shelf = document.createElement('div');
        shelf.id = 'dl-shelf';
        shelf.style.cssText = 'flex:1 1 auto;overflow:auto;padding:22px;display:grid;'
            + 'grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px;align-content:start;';

        overlay.appendChild(header);
        overlay.appendChild(shelf);
        document.body.appendChild(overlay);

        const close = () => { try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { } };
        header.querySelector('#dl-close').onclick = close;

        // ---- Play a demo (in-place, honoring the script's own wait timings) -------------
        const play = (d) => {
            close();
            try { window.__bajaLiveGraph = graph; window.__bajaLiveLayout = graph.genegraph_panel_layout || genegraph_panel_layout || null; } catch (e) { }
            try { exec('manchester/demo.js', scriptText(d), { stepDelayMs: 0, inPlace: true }); }
            catch (e) { try { graph.setMessage(' Demo failed: ' + (e && e.message ? e.message : e)); } catch (e2) { } }
        };

        // ---- Editor panel (new / edit) --------------------------------------------------
        const openEditor = (existing) => {
            try { const old = document.getElementById('dl-editor'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
            const wrap = document.createElement('div');
            wrap.id = 'dl-editor';
            wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483260;background:rgba(4,12,22,0.72);display:flex;align-items:center;justify-content:center;';
            const card = document.createElement('div');
            card.style.cssText = 'width:min(680px,94vw);max-height:90vh;overflow:auto;background:#0b2545;color:#fff;border-radius:12px;'
                + 'box-shadow:0 12px 40px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.14);font:13px Arial;padding:18px;';
            const inp = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:9px 12px;font:13px Arial;';
            const lbl = 'display:block;font:600 12px Arial;color:#9fb3c8;margin:12px 0 4px;';
            card.innerHTML = ''
                + '<div style="font:700 17px Arial;margin-bottom:4px;">' + (existing ? 'Edit demo' : 'New demo') + '</div>'
                + '<label style="' + lbl + '">Name</label><input id="dl-e-name" style="' + inp + '" value="' + esc(existing ? existing.name : '') + '"/>'
                + '<label style="' + lbl + '">Description</label><input id="dl-e-desc" style="' + inp + '" value="' + esc(existing ? existing.description : '') + '"/>'
                + '<label style="' + lbl + '">Script (JSON array of demo commands)</label>'
                + '<textarea id="dl-e-script" spellcheck="false" style="' + inp + 'height:260px;font:12px ui-monospace,Menlo,Consolas,monospace;resize:vertical;" placeholder="Paste a recorded JSON script here…">' + esc(existing ? scriptText(existing) : '') + '</textarea>'
                + '<div id="dl-e-err" style="color:#f59e9e;font:12px Arial;margin-top:8px;min-height:16px;"></div>'
                + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">'
                + '<button id="dl-e-cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 13px Arial;border:1px solid rgba(255,255,255,0.25);background:transparent;color:#fff;">Cancel</button>'
                + '<button id="dl-e-save" style="cursor:pointer;border-radius:8px;padding:9px 20px;font:700 13px Arial;border:none;background:#22c55e;color:#04210f;">Save</button>'
                + '</div>';
            wrap.appendChild(card);
            document.body.appendChild(wrap);
            const closeE = () => { try { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } catch (e) { } };
            card.querySelector('#dl-e-cancel').onclick = closeE;
            card.querySelector('#dl-e-save').onclick = () => {
                const name = ('' + card.querySelector('#dl-e-name').value).trim() || 'Untitled demo';
                const desc = ('' + card.querySelector('#dl-e-desc').value).trim();
                const raw = ('' + card.querySelector('#dl-e-script').value).trim();
                let parsed;
                try { parsed = JSON.parse(raw); } catch (e) { card.querySelector('#dl-e-err').textContent = 'Script is not valid JSON: ' + (e && e.message ? e.message : e); return; }
                if (!Array.isArray(parsed)) { card.querySelector('#dl-e-err').textContent = 'Script must be a JSON array of command objects.'; return; }
                if (existing) {
                    existing.name = name; existing.description = desc; existing.script = parsed;
                } else {
                    demos.push({ id: uid(), name: name, description: desc, script: parsed, created: Date.now() });
                }
                store(demos);
                closeE();
                render();
            };
        };

        // ---- Render the shelf -----------------------------------------------------------
        const demoCard = (d) => {
            const card = document.createElement('div');
            card.style.cssText = 'display:flex;flex-direction:column;height:230px;border-radius:10px;overflow:hidden;'
                + 'box-shadow:0 6px 18px rgba(0,0,0,0.4);background:#0b2545;';
            card.innerHTML = ''
                + '<button class="dl-play" title="Play this demo" style="flex:1;cursor:pointer;text-align:left;border:0;'
                + 'background:linear-gradient(135deg,#1aa3bd 0%, rgba(0,0,0,0.4) 140%);color:#fff;padding:16px 16px 12px 18px;border-left:5px solid rgba(255,255,255,0.35);position:relative;">'
                + '<div style="position:absolute;top:12px;right:12px;font:700 26px Arial;color:rgba(255,255,255,0.85);">▶</div>'
                + '<div style="font:800 16px/1.25 Georgia,\'Times New Roman\',serif;word-break:break-word;margin-top:24px;">' + esc(d.name) + '</div>'
                + '<div style="font:11.5px Arial;color:rgba(255,255,255,0.9);margin-top:8px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">' + esc(d.description || '') + '</div>'
                + '</button>'
                + '<div style="flex:0 0 auto;background:#0b2545;border-top:1px solid rgba(255,255,255,0.12);padding:8px 10px;display:flex;align-items:center;gap:6px;">'
                + '<span style="font:10.5px Arial;color:#8fb8c8;flex:1;">' + stepCount(d) + ' steps</span>'
                + '<button class="dl-edit" style="cursor:pointer;border-radius:6px;padding:5px 10px;font:700 11px Arial;border:1px solid #1aa3bd;background:transparent;color:#4fd0e6;">Edit</button>'
                + '<button class="dl-del" style="cursor:pointer;border-radius:6px;padding:5px 10px;font:700 11px Arial;border:1px solid #b45; background:transparent;color:#f0a0a0;">Delete</button>'
                + '</div>';
            card.querySelector('.dl-play').onclick = () => play(d);
            card.querySelector('.dl-edit').onclick = () => openEditor(d);
            const delBtn = card.querySelector('.dl-del');
            delBtn.onclick = () => {
                if (delBtn.getAttribute('data-armed') === '1') {
                    const i = demos.indexOf(d);
                    if (i >= 0) { demos.splice(i, 1); store(demos); render(); }
                } else {
                    delBtn.setAttribute('data-armed', '1');
                    delBtn.textContent = 'Confirm?';
                    delBtn.style.background = '#b4451f'; delBtn.style.color = '#fff';
                    setTimeout(() => { try { delBtn.removeAttribute('data-armed'); delBtn.textContent = 'Delete'; delBtn.style.background = 'transparent'; delBtn.style.color = '#f0a0a0'; } catch (e) { } }, 2600);
                }
            };
            return card;
        };

        const render = () => {
            const q = ('' + (header.querySelector('#dl-search').value || '')).trim().toLowerCase();
            header.querySelector('#dl-count').textContent = demos.length + ' saved demo' + (demos.length === 1 ? '' : 's') + ' — click ▶ to play, or Edit / Delete to manage';
            shelf.innerHTML = '';
            let shown = 0;
            for (const d of demos) {
                if (q && ([d.name, d.description].join(' ').toLowerCase().indexOf(q) < 0)) continue;
                shelf.appendChild(demoCard(d));
                shown++;
            }
            if (!shown) {
                const empty = document.createElement('div');
                empty.style.cssText = 'grid-column:1/-1;color:#8fb8c8;font:14px Arial;padding:40px;text-align:center;';
                empty.textContent = demos.length ? 'No demos match your search.' : 'No demos yet — click “+ New demo” to add one.';
                shelf.appendChild(empty);
            }
        };

        header.querySelector('#dl-new').onclick = () => openEditor(null);
        header.querySelector('#dl-search').addEventListener('input', render);
        try { document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape' && document.getElementById('baja-demos-library') && !document.getElementById('dl-editor')) { e.preventDefault(); close(); document.removeEventListener('keydown', onEsc, true); } }, true); } catch (e) { }

        render();
        return graph;
    })();
}
