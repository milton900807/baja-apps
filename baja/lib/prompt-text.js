function (opts) {
    // A paragraph prompt: title, a line of guidance, a TEXTAREA with a placeholder and an
    // optional starting text, Cancel and an action button. Resolves the text (trimmed) or
    // null on cancel.   const text = await exec('baja/lib/prompt-text.js', { title, message, placeholder, value, action })
    //   opts.historyKey: remember the last 10 texts submitted under this key (in this
    //   browser) and offer them back under "Recent prompts".
    //   opts.completions: type-ahead like the menubar input: [{ label, insert, hint, table }]
    //   (plateTrack.getFormulaCompletions()). After "[" the row labels of the table written
    //   before it; after an operator (or at the start) the tables. Tab or Enter completes
    //   the highlighted match, arrows move, Esc closes the list.
    //   opts.actions: [{ key, label }] puts several action buttons on the panel (the first is
    //   the primary one Ctrl+Enter fires); the promise then resolves { action: key, text }
    //   instead of the bare text, and null on cancel.
    //   opts.mono: monospace text (formulas, code).
    return new Promise((resolve) => {
        const o = opts || {};
        const HKEY = o.historyKey ? ('baja.prompt.' + o.historyKey) : null;
        const readHist = () => { try { const a = JSON.parse(localStorage.getItem(HKEY) || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.trim()) : []; } catch (e) { return []; } };
        const writeHist = (text) => {
            if (!HKEY || !text) return;
            try {
                const t = ('' + text).trim();
                const a = readHist().filter(x => x.trim() !== t);
                a.unshift(t);
                localStorage.setItem(HKEY, JSON.stringify(a.slice(0, 10)));
            } catch (e) { }
        };
        const hist = HKEY ? readHist() : [];
        const esc = (v) => ('' + (v == null ? '' : v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const mobile = (typeof isMobile === 'function') && isMobile();
        const acts = Array.isArray(o.actions) ? o.actions.filter(a => a && a.key && a.label) : [];
        const result = (text) => acts.length ? { action: acts[0].key, text } : text;
        try { const old = document.getElementById('baja-prompt-text'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        try { const old = document.getElementById('baja-prompt-text-backdrop'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const panel = document.createElement('div');
        panel.id = 'baja-prompt-text';
        panel.style.cssText = mobile
            ? 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#ffffff;color:#0a2540;padding:16px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;'
            : 'position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:2147483000;width:min(680px,94vw);max-height:calc(100vh - 100px);display:flex;flex-direction:column;'
            + 'background:#ffffff;color:#0a2540;border-radius:12px;box-shadow:0 12px 40px rgba(10,37,64,0.35);border:1px solid rgba(10,37,64,0.14);padding:18px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;';
        panel.innerHTML = ''
            + '<div style="font:600 16px system-ui;margin-bottom:4px;">' + esc(o.title || 'Describe it') + '</div>'
            + (o.message ? '<div style="font-size:12.5px;color:#4a5a70;margin-bottom:10px;">' + esc(o.message) + '</div>' : '')
            + (hist.length ? '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
                + '<label for="pt-hist" style="font:600 11px system-ui;letter-spacing:.06em;text-transform:uppercase;color:#6b7a90;white-space:nowrap;">Recent prompts</label>'
                + '<select id="pt-hist" style="flex:1;min-width:0;background:#f4f7fa;color:#0a2540;border:1px solid #c7d2dd;border-radius:8px;padding:7px 8px;font:12.5px system-ui;">'
                + '<option value="">Choose one to bring it back…</option>'
                + hist.map((h, i) => '<option value="' + i + '">' + esc(h.length > 90 ? h.slice(0, 90) + '…' : h) + '</option>').join('')
                + '</select>'
                + '<button id="pt-hist-clear" type="button" title="Forget the recent prompts" style="cursor:pointer;border-radius:8px;padding:6px 10px;font:600 11px system-ui;border:1px solid #c7d2dd;background:transparent;color:#6b7a90;">Clear</button>'
                + '</div>' : '')
            + '<textarea id="pt-text" rows="' + (mobile ? 10 : 7) + '" placeholder="' + esc(o.placeholder || '') + '" style="flex:1;width:100%;box-sizing:border-box;resize:vertical;min-height:140px;'
            + 'background:#f4f7fa;color:#0a2540;border:1px solid #c7d2dd;border-radius:8px;padding:10px 12px;font:14px/1.45 ' + (o.mono ? 'ui-monospace,Menlo,Consolas,monospace' : 'system-ui,-apple-system,Roboto,sans-serif') + ';outline:none;"></textarea>'
            + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">'
            + '<button id="pt-cancel" type="button" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:600 13px system-ui;border:1px solid #c7d2dd;background:transparent;color:#0a2540;">Cancel</button>'
            + (acts.length
                ? acts.map((a, i) => '<button type="button" class="pt-act" data-key="' + esc(a.key) + '" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:600 13px system-ui;'
                    + (i === 0 ? 'border:1px solid #1aa3bd;background:#1aa3bd;color:#ffffff;' : 'border:1px solid #1aa3bd;background:transparent;color:#0a2540;') + '">' + esc(a.label) + '</button>').join('')
                : '<button id="pt-ok" type="button" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:600 13px system-ui;border:1px solid #1aa3bd;background:#1aa3bd;color:#ffffff;">' + esc(o.action || 'Build') + '</button>')
            + '</div>';
        const backdrop = document.createElement('div');
        backdrop.id = 'baja-prompt-text-backdrop';
        backdrop.style.cssText = 'position:fixed;inset:0;z-index:2147482999;background:rgba(10,37,64,0.35);';
        document.body.appendChild(backdrop); document.body.appendChild(panel);
        const ta = panel.querySelector('#pt-text');
        ta.value = o.value || '';
        const hsel = panel.querySelector('#pt-hist');
        if (hsel) {
            hsel.onchange = () => { const i = +hsel.value; if (Number.isFinite(i) && hist[i] != null) { ta.value = hist[i]; ta.focus(); } };
            const hc = panel.querySelector('#pt-hist-clear');
            if (hc) hc.onclick = () => { try { localStorage.removeItem(HKEY); } catch (e) { } hsel.parentNode.style.display = 'none'; };
        }
        ta.addEventListener('focus', () => { ta.style.borderColor = '#1aa3bd'; ta.style.boxShadow = '0 0 0 3px rgba(26,163,189,0.25)'; });
        ta.addEventListener('blur', () => { ta.style.borderColor = '#c7d2dd'; ta.style.boxShadow = 'none'; });

        // ---- type-ahead ---------------------------------------------------------------
        const comps = Array.isArray(o.completions) ? o.completions.map(c => (typeof c === 'string') ? { label: c, insert: c } : c).filter(c => c && c.label) : [];
        const TRIG = ['=', '+', '-', '*', '/', '^', '(', '[', ',', ' '];
        let list = null, items = [], hi = 0;
        if (comps.length) {
            list = document.createElement('div');
            list.id = 'pt-suggest';
            list.hidden = true;
            list.style.cssText = 'margin-top:4px;max-height:180px;overflow:auto;background:#ffffff;color:#0a2540;border:1px solid rgba(10,37,64,0.18);border-radius:8px;box-shadow:0 8px 24px rgba(10,37,64,0.25);padding:4px;font:13px system-ui;';
            ta.insertAdjacentElement('afterend', list);
        }
        const spanAt = () => {
            const text = ta.value || '', caret = ta.selectionStart == null ? text.length : ta.selectionStart;
            const before = text.slice(0, caret);
            let idx = -1, ch = null;
            for (const t of TRIG) { const i = before.lastIndexOf(t); if (i > idx) { idx = i; ch = t; } }
            const insertStart = idx + 1;
            return { ch, start: idx, insertStart, caret, term: before.slice(insertStart).replace(/^\s+/, ''), before };
        };
        const candidates = (sp) => {
            const isLabel = (c) => !!c.table;
            if (sp.ch === '[') {
                const m = /([A-Za-z_][\w.-]*)\s*$/.exec(sp.before.slice(0, sp.start));
                const ctx = m ? m[1].toLowerCase() : '';
                const scoped = ctx ? comps.filter(c => isLabel(c) && ('' + c.table).toLowerCase() === ctx) : [];
                if (scoped.length) return scoped;
                const labels = comps.filter(isLabel);
                return labels.length ? labels : comps;
            }
            const tables = comps.filter(c => !isLabel(c));
            return tables.length ? tables : comps;
        };
        const rank = (pool, needle) => {
            if (!needle) return pool.slice();
            const a = [], b = [];
            for (const c of pool) { const l = c.label.toLowerCase(); if (l.startsWith(needle)) a.push(c); else if (l.includes(needle)) b.push(c); }
            return a.concat(b);
        };
        const hideList = () => { if (list) { list.hidden = true; items = []; hi = 0; } };
        const renderList = () => {
            if (!list) return;
            list.innerHTML = items.slice(0, 12).map((c, i) => '<div class="pt-opt" data-i="' + i + '" style="display:flex;justify-content:space-between;gap:10px;padding:5px 8px;border-radius:6px;cursor:pointer;'
                + (i === hi ? 'background:#e6f6f9;' : '') + '"><span>' + esc(c.label) + '</span><span style="color:#6b7a90;font-size:11px;">' + esc(c.hint || c.table || '') + '</span></div>').join('');
            list.hidden = items.length === 0;
            list.querySelectorAll('.pt-opt').forEach((el) => {
                el.onmousedown = (ev) => { ev.preventDefault(); pick(+el.getAttribute('data-i')); };
            });
        };
        const refresh = () => {
            if (!comps.length) return;
            const sp = spanAt();
            const last = sp.before.slice(-1);
            if (!sp.term || last === ']' || last === ')') { hideList(); return; }
            items = rank(candidates(sp), sp.term.toLowerCase());
            if (items.length === 1 && items[0].label.toLowerCase() === sp.term.toLowerCase()) { hideList(); return; }
            hi = 0;
            renderList();
        };
        const pick = (i) => {
            const c = items[i]; if (!c) return;
            const sp = spanAt();
            const insert = ('' + (c.insert || c.label)).trim();
            const typed = sp.term;
            const tail = insert.toLowerCase().startsWith(typed.toLowerCase()) ? insert.slice(typed.length) : insert;
            const text = ta.value || '';
            const next = text.slice(0, sp.caret) + tail + text.slice(sp.caret);
            ta.value = next;
            const pos = sp.caret + tail.length;
            try { ta.setSelectionRange(pos, pos); } catch (e) { }
            hideList();
            ta.focus();
            // a table just completed ends in "[": offer its labels straight away
            setTimeout(refresh, 0);
        };
        if (comps.length) {
            ta.addEventListener('input', refresh);
            ta.addEventListener('click', refresh);
            ta.addEventListener('keyup', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') refresh(); });
        }
        let onKey;
        const close = (val) => {
            try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
            try { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); } catch (e) { }
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            resolve(val);
        };
        onKey = (e) => {
            const open = !!(list && !list.hidden && items.length);
            if (open && (e.key === 'Tab' || (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)))) { e.preventDefault(); e.stopPropagation(); pick(hi); return; }
            if (open && e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); hi = Math.min(items.length - 1, Math.min(11, hi + 1)); renderList(); return; }
            if (open && e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); hi = Math.max(0, hi - 1); renderList(); return; }
            if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hideList(); return; }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); writeHist(ta.value); close(result(('' + ta.value).trim())); }
            else e.stopPropagation();   // typing stays in the textarea, never in the canvas
        };
        document.addEventListener('keydown', onKey, true);
        panel.querySelector('#pt-cancel').onclick = () => close(null);
        const ok = panel.querySelector('#pt-ok');
        if (ok) ok.onclick = () => { writeHist(ta.value); close(('' + ta.value).trim()); };
        panel.querySelectorAll('.pt-act').forEach((b) => { b.onclick = () => { writeHist(ta.value); close({ action: b.getAttribute('data-key'), text: ('' + ta.value).trim() }); }; });
        backdrop.onclick = () => close(null);
        setTimeout(() => { try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { } }, 0);
    });
}
