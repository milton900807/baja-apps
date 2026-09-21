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
            : 'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:2147483000;width:min(980px,94vw);height:calc(100vh - 112px);max-height:calc(100vh - 112px);display:flex;flex-direction:column;'
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
            + '<textarea id="pt-text" rows="' + (mobile ? 10 : 18) + '" placeholder="' + esc(o.placeholder || '') + '" style="flex:1 1 auto;width:100%;box-sizing:border-box;resize:vertical;min-height:220px;'
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

        // ---- type-ahead -----------------------------------------------------------------
        // THE SHARED LIST (the frontend's suggest-list.ts, on window). This prompt used to
        // carry its own copy: same trigger characters, same scoping to the table before
        // "[", but ranked startsWith-then-includes where the real one scores six ways,
        // capped at 12 rows, and styled with inline strings. One list, one set of rules.
        // If the frontend is older than this file the constructor is simply missing, and
        // the prompt is a plain text box -- which is what it was before it had suggestions.
        const comps = Array.isArray(o.completions) ? o.completions.map(c => (typeof c === 'string') ? { label: c, insert: c } : c).filter(c => c && c.label) : [];
        let sug = null;
        try {
            const SL = window['LionSuggest'];
            if (SL && comps.length) {
                sug = new SL({
                    input: ta,
                    mode: 'formula',
                    groupTitles: true,
                    items: () => comps,
                    footer: '<b>&#8595;&#8593;</b> move &nbsp; <b>Tab</b>/<b>Enter</b> insert &nbsp; <b>Esc</b> close'
                });
            }
        } catch (e) { console.warn('prompt-text: no completion list', e); }

        let onKey;
        const close = (val) => {
            try { if (sug) sug.destroy(); } catch (e) { }
            try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
            try { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); } catch (e) { }
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            resolve(val);
        };
        onKey = (e) => {
            // THE LIST'S KEYS GO TO THE LIST. This listener is on the document in capture,
            // which runs before the textarea's own capture listener, so without standing
            // aside here the list would never see Up/Down/Tab/Enter/Escape at all.
            const open = !!(sug && sug.isOpen);
            if (open && !(e.ctrlKey || e.metaKey) &&
                ['Tab', 'Enter', 'ArrowDown', 'ArrowUp', 'Escape'].indexOf(e.key) >= 0) return;
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
