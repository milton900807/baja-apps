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

        // Where the cell is on the page.
        let left = 20, top = 120, width = 200, height = 40;
        try {
            let el = null;
            try { const c = CurrentLayout.getStashed('graph-canvas'); el = c && c.canvas; if (el && el.nativeElement) el = el.nativeElement; } catch (e) { el = null; }
            if (!el || !el.getBoundingClientRect) el = document.querySelector('canvas[tabindex]') || document.querySelector('canvas');
            const r = el ? el.getBoundingClientRect() : { left: 0, top: 0 };
            left = Math.round(r.left + (well.__screen_x || 0));
            top = Math.round(r.top + (well.__screen_y || 0));
            width = Math.max(120, Math.round(well.__screen_width || 120));
            height = Math.max(36, Math.round(well.__screen_height || 36));
        } catch (e) { }
        left = Math.max(4, Math.min(left, window.innerWidth - width - 4));
        top = Math.max(4, Math.min(top, window.innerHeight - height - 4));

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
        input.style.cssText = 'position:fixed;left:' + left + 'px;top:' + top + 'px;width:' + width + 'px;height:' + height + 'px;z-index:2147483000;'
            + 'box-sizing:border-box;padding:0 10px;border:2px solid #1aa3bd;border-radius:6px;background:#ffffff;color:#0a2540;'
            + 'font:16px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;outline:none;box-shadow:0 8px 24px rgba(10,37,64,0.35);';
        document.body.appendChild(input);
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
