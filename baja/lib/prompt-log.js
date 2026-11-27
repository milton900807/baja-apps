function () {

    // WHAT HAS BEEN ASKED OF THE EDITOR, kept, readable, and runnable again.
    //   const LOG = await exec('baja/lib/prompt-log.js');
    //   const id = LOG.add({ ask, status, steps, error });   // returns the entry's id
    //   LOG.ran(id, 2);                                      // 2 steps were actually run
    //   await LOG.open(graph, genegraph_panel_layout);       // the window
    //
    // A typed request is the most expensive thing in this editor to reproduce: it took a
    // sentence to get right, it chose a plan, and five minutes later the only record of it
    // was whatever is still in the box. People retype them from memory, slightly
    // differently, and get a different plan, which reads as the editor being inconsistent
    // rather than the sentence having changed.
    //
    // WHAT IS KEPT, and what is not. The sentence, when it was asked, what it was READ AS
    // (the capability names the planner chose and their arguments), whether the plan came
    // back OK, and how many of its steps were then run. Not what those steps did to the
    // data: this is a log of requests, not an undo history, and a row saying "ran" is not
    // a claim that the result was right.
    //
    // RUNNING AGAIN RE-PLANS. The sentence is put back into the command bar and read
    // afresh against the canvas as it is NOW, rather than the stored steps being replayed.
    // Replaying them would run yesterday's track names and yesterday's selection against
    // today's screen, which is how a repeat quietly does something else.
    //
    // IN THE BROWSER, PER PERSON. localStorage, so it survives a reload and never leaves
    // the machine. Every read and write is guarded: in a private window the accessor
    // itself throws, and a log that cannot be written is not a reason for a request to
    // fail, so it falls back to memory for the session and says nothing.

    const KEY = 'baja.prompt.log';
    const MAX = 200;                 // enough to find last week's; small enough to stay quick
    let memory = null;               // the fallback when storage will not have us

    const readLog = () => {
        if (memory) return memory;
        try {
            const raw = window.localStorage.getItem(KEY);
            const a = raw ? JSON.parse(raw) : [];
            return Array.isArray(a) ? a : [];
        } catch (e) { memory = memory || []; return memory; }
    };
    const writeLog = (a) => {
        if (memory) { memory = a; return; }
        try { window.localStorage.setItem(KEY, JSON.stringify(a.slice(0, MAX))); }
        catch (e) { memory = a.slice(0, MAX); }
    };

    const now = () => {
        try { return new Date().toISOString(); } catch (e) { return ''; }
    };
    const when = (iso) => {
        try {
            const d = new Date(iso);
            const ms = Date.now() - d.getTime();
            if (ms < 60000) return 'just now';
            if (ms < 3600000) return Math.round(ms / 60000) + ' min ago';
            if (ms < 86400000) return Math.round(ms / 3600000) + ' h ago';
            const days = Math.round(ms / 86400000);
            if (days < 8) return days + ' d ago';
            return d.toLocaleDateString();
        } catch (e) { return ''; }
    };

    const list = () => readLog();

    const add = (e) => {
        const o = e || {};
        const ask = ('' + (o.ask || '')).trim();
        if (!ask) return null;
        const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const steps = [];
        for (const s of (o.steps || [])) {
            if (!s) continue;
            steps.push({
                capability: ('' + (s.capability || s.name || '')),
                args: (s.args && typeof s.args === 'object') ? s.args : {}
            });
        }
        const a = readLog();
        // THE SAME SENTENCE TWICE IN A ROW IS ONE ENTRY, updated. Pressing Enter again
        // after a plan looked wrong is normal, and three identical rows is a log nobody
        // reads. A repeat later in the session is its own row, because by then the canvas
        // has moved on and the plan may be a different one.
        const top = a[0];
        if (top && top.ask === ask && (Date.now() - Date.parse(top.at || 0)) < 120000) {
            top.at = now(); top.status = ('' + (o.status || top.status || ''));
            top.steps = steps.length ? steps : top.steps;
            // A repeat with nothing to say must not erase what the first attempt said:
            // the reason a sentence found no plan is the thing worth looking back at.
            top.error = ('' + (o.error || top.error || ''));
            top.repeats = (+top.repeats || 1) + 1;
            writeLog(a);
            return top.id;
        }
        a.unshift({
            id: id, ask: ask, at: now(),
            status: ('' + (o.status || '')),
            error: ('' + (o.error || '')),
            steps: steps, ran: 0, repeats: 1
        });
        writeLog(a);
        return id;
    };

    // How many steps were actually run. A plan that was read and then cancelled is a real
    // outcome and the log says so rather than implying the editor did it.
    const ran = (id, n) => {
        if (!id) return;
        const a = readLog();
        for (const e of a) {
            if (e.id !== id) continue;
            e.ran = Math.max(+e.ran || 0, (n == null ? 1 : +n || 0));
            writeLog(a);
            return;
        }
    };

    const remove = (id) => {
        const a = readLog().filter((e) => e.id !== id);
        writeLog(a);
    };
    const wipeLog = () => writeLog([]);

    const csv = () => {
        const q = (v) => {
            const s = '' + (v == null ? '' : v);
            return /[",\n]/.test(s) ? ('"' + s.replace(/"/g, '""') + '"') : s;
        };
        const out = ['when,request,status,read_as,steps_run,repeats,error'];
        for (const e of readLog()) {
            out.push([e.at, e.ask, e.status,
                (e.steps || []).map((s) => s.capability).join(' '),
                e.ran, e.repeats || 1, e.error].map(q).join(','));
        }
        return out.join('\n') + '\n';
    };

    // ---- THE WINDOW --------------------------------------------------------------------
    const open = async (graph, genegraph_panel_layout) => {
        const OV = await exec('baja/lib/canvas-overlay-panel.js');
        const C = OV.colors;
        const esc = (t) => ('' + (t == null ? '' : t))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const body = document.createElement('div');
        body.style.cssText = 'padding:14px 16px 40px;color:' + C.text + ';font:13px ' + C.font + ';';

        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;';
        const mkBtn = (t, on) => {
            const b = document.createElement('button');
            b.textContent = t;
            b.style.cssText = 'background:transparent;color:' + C.accent + ';border:1px solid '
                + C.outline + ';border-radius:6px;padding:4px 10px;cursor:pointer;font:12px ' + C.font + ';';
            b.onclick = on;
            return b;
        };
        const find = document.createElement('input');
        find.placeholder = 'find a request';
        find.style.cssText = 'flex:1 1 200px;min-width:140px;background:rgba(255,255,255,0.06);color:'
            + C.text + ';border:1px solid ' + C.line + ';border-radius:6px;padding:4px 8px;font:12px ' + C.font + ';';
        find.oninput = () => paint();
        bar.appendChild(find);
        const dl = mkBtn('Download CSV', () => {
            try {
                const blob = new Blob([csv()], { type: 'text/csv' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'prompt-log.csv';
                document.body.appendChild(a); a.click();
                setTimeout(() => { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) { } }, 0);
                dl.textContent = 'Saved';
            } catch (e) { dl.textContent = 'Could not save'; }
            setTimeout(() => { dl.textContent = 'Download CSV'; }, 1600);
        });
        bar.appendChild(dl);
        // CLEARING IS NOT UNDOING, and it cannot be undone itself, so it asks once.
        let armed = false;
        const clr = mkBtn('Clear the log', () => {
            if (!armed) {
                armed = true;
                clr.textContent = 'Clear ' + readLog().length + ' entries?  press again';
                setTimeout(() => { armed = false; clr.textContent = 'Clear the log'; }, 4000);
                return;
            }
            wipeLog(); armed = false; clr.textContent = 'Clear the log'; paint();
        });
        bar.appendChild(clr);
        body.appendChild(bar);

        const rowsEl = document.createElement('div');
        body.appendChild(rowsEl);

        const again = async (ask) => {
            // Back into the command bar, not straight onto the canvas: the sentence is
            // read afresh against the canvas as it is now, and the plan is shown before
            // anything runs, exactly as it was the first time.
            try { panel.close(); } catch (e) { }
            try {
                await exec('baja/manchester/menu/editor-command.js', graph,
                    genegraph_panel_layout, { prefill: ask });
            } catch (e) {
                try { graph.setResultMessage(' Could not reopen the request: '
                    + (e && e.message ? e.message : e) + ' '); } catch (e2) { }
            }
        };

        const paint = () => {
            const q = ('' + find.value).trim().toLowerCase();
            const all = readLog();
            const shown = all.filter((e) => !q
                || (e.ask + ' ' + (e.steps || []).map((s) => s.capability).join(' ')).toLowerCase().indexOf(q) >= 0);
            if (!all.length) {
                rowsEl.innerHTML = '<div style="padding:18px 2px;color:' + C.dim + '">Nothing has '
                    + 'been asked of the editor on this machine yet. Requests typed into the box '
                    + 'at the top appear here, with what they were read as.</div>';
                return;
            }
            if (!shown.length) {
                rowsEl.innerHTML = '<div style="padding:18px 2px;color:' + C.dim + '">Nothing '
                    + 'matches that. ' + all.length + ' request' + (all.length === 1 ? '' : 's')
                    + ' in the log.</div>';
                return;
            }
            rowsEl.innerHTML = shown.map((e, i) => {
                const caps = (e.steps || []).map((s) => s.capability).filter(Boolean);
                const bad = (e.status && e.status !== 'OK');
                return '<div style="border-top:1px solid ' + C.rule + ';padding:10px 2px;">'
                    + '<div style="display:flex;gap:10px;align-items:baseline;">'
                    + '<div style="flex:1 1 auto;min-width:0;">'
                    + '<div style="color:' + C.text + ';">' + esc(e.ask) + '</div>'
                    + '<div style="font-size:11.5px;color:' + C.dim + ';margin-top:3px;">'
                    + esc(when(e.at))
                    + (caps.length ? (' · read as ' + esc(caps.join(', '))) : '')
                    + (bad ? (' · <span style="color:' + C.warm + '">no plan'
                        + (e.error ? (': ' + esc(e.error)) : '') + '</span>') : '')
                    + (e.ran ? (' · ' + e.ran + ' step' + (e.ran === 1 ? '' : 's') + ' run')
                        : (caps.length ? ' · nothing was run' : ''))
                    + ((+e.repeats > 1) ? (' · asked ' + e.repeats + ' times') : '')
                    + '</div></div>'
                    + '<button data-again="' + i + '" style="flex:0 0 auto;background:transparent;color:'
                    + C.accent + ';border:1px solid ' + C.outline + ';border-radius:6px;padding:3px 10px;'
                    + 'cursor:pointer;font:12px ' + C.font + ';">Run again</button>'
                    + '<button data-copy="' + i + '" style="flex:0 0 auto;background:transparent;color:'
                    + C.dim + ';border:1px solid ' + C.line + ';border-radius:6px;padding:3px 10px;'
                    + 'cursor:pointer;font:12px ' + C.font + ';">Copy</button>'
                    + '<button data-drop="' + i + '" style="flex:0 0 auto;background:transparent;color:'
                    + C.dim + ';border:1px solid ' + C.line + ';border-radius:6px;padding:3px 8px;'
                    + 'cursor:pointer;font:12px ' + C.font + ';">✕</button>'
                    + '</div></div>';
            }).join('');
            for (const b of rowsEl.querySelectorAll('[data-again]')) {
                b.onclick = () => again(shown[+b.getAttribute('data-again')].ask);
            }
            for (const b of rowsEl.querySelectorAll('[data-copy]')) {
                b.onclick = async () => {
                    try { await navigator.clipboard.writeText(shown[+b.getAttribute('data-copy')].ask); b.textContent = 'Copied'; }
                    catch (e) { b.textContent = 'Copy failed'; }
                    setTimeout(() => { b.textContent = 'Copy'; }, 1400);
                };
            }
            for (const b of rowsEl.querySelectorAll('[data-drop]')) {
                b.onclick = () => { remove(shown[+b.getAttribute('data-drop')].id); paint(); };
            }
        };
        paint();

        const panel = OV.open({
            id: 'prompt-log',
            title: 'What you have asked for',
            body: body,
            maximized: true
        });
        return { panel: panel, paint: paint, body: body };
    };

    return { add: add, ran: ran, list: list, remove: remove, clear: wipeLog, csv: csv,
        open: open, when: when, KEY: KEY };
}
