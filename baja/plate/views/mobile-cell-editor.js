function (pt, plate, wells, opts) {
    // opts.voice: start listening at once (set when "next" moved the entry to this cell).
    // MOBILE CELL EDITOR: a plain text field laid over the cell, so the phone's own
    // keyboard does the typing. No modal text window (Monaco is too heavy and too big for
    // a phone). Enter or Done commits, Escape cancels, tapping elsewhere commits. A value
    // starting with "=" is stored as the cell's formula, as the desktop editor does.
    return (async () => {
        const list = (Array.isArray(wells) ? wells : []).filter(Boolean);
        const well = list[0];
        if (!well) return false;
        let HM = null;
        try { HM = await exec('baja/history/HM'); } catch (e) { HM = null; }

        try { const old = document.getElementById('baja-mobile-cell-input'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }

        // WHERE IT SITS. Over the cell is the wrong place on a phone: a cell is often
        // narrower than a finger, and the keyboard covers the bottom half of the screen --
        // which is where a cell near the foot of a table is. So the editor is a bar docked
        // to the bottom of the window, full width, and it rides above the keyboard using
        // the visual viewport (the part of the page not covered by it). The cell it is
        // editing is named on the bar, since it is no longer next to it.
        const BAR_H = 56;
        const vv = window.visualViewport || null;
        const dockBottom = () => {
            try {
                if (!vv) return 0;
                // How much of the window the keyboard is covering.
                return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
            } catch (e) { return 0; }
        };

        // The text to edit: the formula when the cell has one, else its value.
        let initial = (well.value == null) ? '' : ('' + well.value);
        try {
            const f = pt.getFormulaForWell(plate.name + plate.getWellRange([well]));
            if (f && ('' + f).length) initial = '' + f;
            else if (well.formula && ('' + well.formula).trim().startsWith('=')) initial = '' + well.formula;
        } catch (e) { }

        const input = document.createElement('input');
        input.id = 'baja-mobile-cell-input';
        input.type = 'text';
        input.value = initial;
        input.setAttribute('autocomplete', 'off'); input.setAttribute('autocorrect', 'off'); input.setAttribute('autocapitalize', 'off'); input.setAttribute('spellcheck', 'false');
        input.setAttribute('enterkeyhint', 'done');
        // 16px or larger, or iOS zooms the whole page in when the field takes focus.
        input.style.cssText = 'flex:1 1 auto;min-width:0;height:40px;box-sizing:border-box;padding:0 12px;'
            + 'border:1px solid #c7d6de;border-radius:10px;background:#ffffff;color:#0a2540;'
            + 'font:16px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;outline:none;';
        input.addEventListener('focus', () => { input.style.borderColor = '#1aa3bd'; input.style.boxShadow = '0 0 0 3px rgba(26,163,189,0.18)'; });
        input.addEventListener('blur', () => { input.style.boxShadow = 'none'; });

        const bar = document.createElement('div');
        bar.id = 'baja-mobile-cell-bar';
        bar.style.cssText = 'position:fixed;left:0;right:0;bottom:' + dockBottom() + 'px;z-index:2147483000;'
            + 'display:flex;align-items:center;gap:8px;padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px));'
            + 'background:#0a2540;border-top:1px solid #1aa3bd;box-shadow:0 -10px 30px rgba(10,37,64,0.35);'
            + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;';

        // Which cell is being edited, since the bar is no longer beside it.
        const whereTxt = (() => {
            try {
                const col0 = plate.wells[0] || [];
                const idx = plate.getWellIndicies ? plate.getWellIndicies(well) : null;
                const rowLab = (idx && col0[idx.rowIdx] && col0[idx.rowIdx].value != null) ? ('' + col0[idx.rowIdx].value).trim() : '';
                const colLab = (idx && plate.wells[idx.colIdx] && plate.wells[idx.colIdx][0] && plate.wells[idx.colIdx][0].value != null)
                    ? ('' + plate.wells[idx.colIdx][0].value).trim() : '';
                return [rowLab, colLab].filter(Boolean).join(' \u203a ') || (plate.name || '');
            } catch (e) { return plate.name || ''; }
        })();
        const where = document.createElement('div');
        where.textContent = whereTxt;
        where.style.cssText = 'flex:0 0 auto;max-width:34%;color:#bfeaf3;font:600 11.5px system-ui;white-space:nowrap;'
            + 'overflow:hidden;text-overflow:ellipsis;';

        bar.appendChild(where);
        bar.appendChild(input);
        document.body.appendChild(bar);

        // DO NOT SIT ON THE BOOKMARKS BADGE. It lives at the bottom right and on a phone it
        // is the way round the workbench -- the way to open a table full window, now that a
        // tap does not. A full-width bar across the bottom covered it, so the badge is
        // lifted to sit just above this bar for as long as it is up, and put back after.
        const navBar = document.getElementById('baja-nav-panel');
        const navBottom0 = navBar ? navBar.style.bottom : null;
        const liftNav = () => {
            if (!navBar) return;
            try {
                const h = Math.ceil(bar.getBoundingClientRect().height) || 56;
                navBar.style.bottom = (dockBottom() + h + 10) + 'px';
            } catch (e) { }
        };
        const dropNav = () => { try { if (navBar) navBar.style.bottom = navBottom0 || '14px'; } catch (e) { } };

        // The bar follows the keyboard as it opens, closes or resizes; the badge rides with it.
        const reDock = () => { try { bar.style.bottom = dockBottom() + 'px'; liftNav(); } catch (e) { } };
        try { if (vv) { vv.addEventListener('resize', reDock); vv.addEventListener('scroll', reDock); } } catch (e) { }
        liftNav();
        const height = 40;
        for (const w of list) { try { w.__editing = true; } catch (e) { } }   // painters skip the input arrow

        // ---- Voice entry ------------------------------------------------------------------
        // A microphone button beside the field. Say the value; say "next" to commit and move
        // to the next cell (listening continues there); say "done" to commit and stop.
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
        const mic = document.createElement('button');
        mic.id = 'baja-mobile-cell-mic';
        mic.type = 'button';
        mic.title = SR ? 'Speak the value; say "next" for the next cell' : 'Voice entry is not available in this browser';
        mic.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>';
        const micLeft = Math.min(window.innerWidth - height - 4, left + width + 6);
        mic.style.cssText = 'position:fixed;left:' + micLeft + 'px;top:' + top + 'px;width:' + height + 'px;height:' + height + 'px;z-index:2147483000;'
            + 'border-radius:8px;border:2px solid #1aa3bd;background:' + (SR ? '#0a2540' : '#9aa7b4') + ';color:#ffffff;display:flex;align-items:center;justify-content:center;cursor:pointer;'
            + 'box-shadow:0 8px 24px rgba(10,37,64,0.35);';
        document.body.appendChild(mic);
        let rec = null, listening = false;
        const setMic = (on) => { listening = on; mic.style.background = on ? '#FD5E53' : '#0a2540'; mic.style.borderColor = on ? '#FD5E53' : '#1aa3bd'; };
        const stopVoice = () => { try { if (rec) { rec.onend = null; rec.stop(); } } catch (e) { } rec = null; setMic(false); };
        const cleanSpoken = (t) => ('' + t).trim().replace(/[.!?]+$/, '').trim();
        const startVoice = () => {
            if (!SR) { try { pt.setMessage('Voice entry is not available in this browser.', 2); } catch (e) { } return; }
            if (rec) { stopVoice(); return; }
            try {
                rec = new SR();
                rec.lang = (navigator.language || 'en-US');
                rec.continuous = true;
                rec.interimResults = true;
                rec.maxAlternatives = 1;
                rec.onresult = (ev) => {
                    let finalText = '', interim = '';
                    for (let i = ev.resultIndex; i < ev.results.length; i++) {
                        const r = ev.results[i];
                        if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
                    }
                    if (interim && !finalText) { input.value = cleanSpoken(interim); return; }
                    if (!finalText) return;
                    const said = cleanSpoken(finalText);
                    const low = said.toLowerCase();
                    // Commands: "next" (alone or at the end), "done" / "stop" / "finish".
                    if (/^(next|next cell)$/.test(low)) { goNext(true); return; }
                    if (/^(done|stop|finish|finished)$/.test(low)) { stopVoice(); commit(); return; }
                    const m = low.match(/^(.*?)[\s,]+(next|next cell)$/);
                    if (m) { input.value = cleanSpoken(said.slice(0, m[1].length)); goNext(true); return; }
                    input.value = said;
                };
                rec.onerror = (ev) => { try { pt.setMessage('Voice entry: ' + (ev && ev.error ? ev.error : 'error'), 2); } catch (e) { } setMic(false); rec = null; };
                rec.onend = () => { if (listening && rec) { try { rec.start(); } catch (e) { setMic(false); rec = null; } } };
                rec.start();
                setMic(true);
                try { pt.setMessage('Listening. Say the value, then "next" for the next cell, or "done".', 3); } catch (e) { }
            } catch (e) { rec = null; setMic(false); try { pt.setMessage('Voice entry could not start.', 2); } catch (x) { } }
        };
        mic.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
        mic.ontouchstart = (e) => { e.stopPropagation(); };
        mic.onclick = (e) => { e.preventDefault(); e.stopPropagation(); startVoice(); };

        let done = false;
        const close = () => {
            if (done) return; done = true;
            for (const w of list) { try { w.__editing = false; } catch (e) { } }
            stopVoice();
            try { input.removeEventListener('keydown', onKey); input.removeEventListener('blur', onBlur); } catch (e) { }
            try { document.removeEventListener('mousedown', onDown, true); document.removeEventListener('touchstart', onDown, true); } catch (e) { }
            try { dropNav(); } catch (e) { }
            try { if (vv) { vv.removeEventListener('resize', reDock); vv.removeEventListener('scroll', reDock); } } catch (e) { }
            try { if (bar.parentNode) bar.parentNode.removeChild(bar); } catch (e) { }
            try { if (input.parentNode) input.parentNode.removeChild(input); } catch (e) { }
            try { if (mic.parentNode) mic.parentNode.removeChild(mic); } catch (e) { }
            try { pt.setTextActive(false); } catch (e) { }
        };
        // Commit and step to the next cell (Tab, or the spoken "next"); voice carries over.
        const goNext = (byVoice, backwards) => {
            const wasListening = listening;
            commit();
            try {
                const next = plate.navigateWell(well, backwards ? 'prev' : 'next', true, pt);
                if (next) { pt.selected_well = next; setTimeout(() => exec('baja/plate/views/mobile-cell-editor.js', pt, plate, [next], { voice: !!(byVoice || wasListening) }), 60); }
                else if (byVoice) { try { pt.setMessage('That was the last cell.', 2); } catch (e) { } }
            } catch (x) { }
        };
        const commit = () => {
            if (done) return;
            const text = '' + input.value;
            close();
            if (text === initial) return;
            try { if (HM && typeof pushHistory === 'function') pushHistory(HM(plate)); } catch (e) { }
            for (const w of list) { try { w.setValue(text); } catch (e) { } }
            try { pt.updateCalculations(); } catch (e) { }
            try { if (pt.__collab && !pt.__collab.holds(plate)) pt.__collab.acquire(plate); } catch (e) { }
        };
        const onKey = (e) => {
            e.stopPropagation();                       // the canvas must not also see these keys
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (e.key === 'Tab') { e.preventDefault(); goNext(false, e.shiftKey); }
        };
        const onBlur = () => { setTimeout(commit, 0); };
        const onDown = (e) => { if (e.target !== input && e.target !== mic && !mic.contains(e.target)) commit(); };
        input.addEventListener('keydown', onKey);
        input.addEventListener('blur', onBlur);
        setTimeout(() => { document.addEventListener('mousedown', onDown, true); document.addEventListener('touchstart', onDown, true); }, 0);
        try { pt.setTextActive(true); } catch (e) { }
        setTimeout(() => { try { input.focus(); input.select(); } catch (e) { } }, 0);
        if (opts && opts.voice) setTimeout(startVoice, 80);
        return true;
    })();
}
