function (config) {

    // tutorials.js — a recorded script, saved under a name, found again by what it does.
    //
    //   exec('manchester/tutorials.js', { mode: 'save', script: <recorded JSON>, graph: graph })
    //   exec('manchester/tutorials.js', { mode: 'browse', graph: graph })
    //   exec('manchester/tutorials.js', { mode: 'play', id: '…' })
    //
    // WHY THIS EXISTS. manchester/recorder.js already turns a piece of work into a script
    // that reproduces it exactly, and manchester/demo.js already plays one back. Between
    // them sat nothing: the script was a text file the browser downloaded, which is a
    // tutorial nobody else will ever run. This is the middle -- a name, a place to keep it
    // (py/tutorials/save-tutorial.py, a SQLite table on the server), and a way to find it
    // again from wherever you happen to be standing.
    //
    // KEYWORDS ARE NOT TYPED. The server derives them from the operations in the script:
    // the label on every button pressed, whatever was typed into a field, the transcripts
    // loaded. A description written by the work cannot drift from the work.
    //
    // CONTEXT RANKS, IT DOES NOT FILTER. The screen you are on and what is loaded on it
    // push the relevant tutorials to the front; everything else is still there, further
    // down, because a list that hides things teaches people it is empty.

    return (async () => {
        const cfg = config || {};
        const graph = cfg.graph || (function () { try { return window.__bajaLiveGraph || null; } catch (e) { return null; } })();
        const say = (m) => { try { if (graph && graph.setMessage) graph.setMessage(' ' + m + ' '); } catch (e) { } };
        const err = (m) => { try { if (graph && graph.setError) graph.setError(' ' + m + ' ', 8); else say(m); } catch (e) { say(m); } };
        const esc = (s) => ('' + (s == null ? '' : s)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

        // WHERE THE CALLER IS. The screen that owns a graph registers a hook for the header's
        // Record and Play buttons; the same hook is the honest answer to "what am I looking
        // at", so this reads it rather than guessing from the URL. A screen that has not
        // registered one still gets its route, which is better than nothing and is what the
        // ranking falls back to.
        const hook = (function () { try { return window.__bajaRecordHook || null; } catch (e) { return null; } })();
        const screenName = ('' + ((cfg.screen != null ? cfg.screen : (hook && hook.where)) || '')).toLowerCase();
        const routeName = ('' + (cfg.route || (function () { try { return window.location.pathname || ''; } catch (e) { return ''; } })()));
        const contextWords = (() => {
            if (cfg.context) return '' + cfg.context;
            let w = screenName + ' ' + routeName.replace(/[\/\-_]+/g, ' ');
            try { if (hook && typeof hook.context === 'function') w += ' ' + (hook.context() || ''); } catch (e) { }
            return w;
        })();

        const monitor = (onMsg) => {
            try { return new EngineMonitor((m) => { try { if (onMsg) onMsg(m); } catch (e) { } }); }
            catch (e) { return null; }
        };
        const call = async (req, onMsg) => {
            const em = monitor(onMsg);
            const rs = await exec('/py/tutorials/' + (req.__tool || 'find-tutorials.py'), em, JSON.stringify(req));
            if (!rs) throw new Error('the server said nothing');
            if (rs.error) throw new Error(rs.error);
            return rs;
        };

        const human = (ms) => {
            const s = Math.round((+ms || 0) / 1000);
            if (!s) return '';
            return s < 60 ? (s + 's') : (Math.floor(s / 60) + 'm ' + (s % 60) + 's');
        };
        const ago = (iso) => {
            try {
                const t = Date.parse(iso);
                if (!t) return '';
                const d = Math.floor((Date.now() - t) / 86400000);
                return d <= 0 ? 'today' : (d === 1 ? 'yesterday' : (d < 30 ? d + ' days ago' : new Date(t).toISOString().slice(0, 10)));
            } catch (e) { return ''; }
        };

        // ---- PLAY -----------------------------------------------------------------------
        // In place, on the live screen, the same way the recorder's own Run does: the real
        // toolbar has to exist for a recorded click to land on it.
        const play = async (id, name) => {
            try {
                say('Loading ' + (name || 'the tutorial') + '…');
                const rs = await call({ id: id, play: true });
                const t = JSON.parse(rs.tutorial || '{}');
                if (!t || !t.script) throw new Error('that tutorial has no script in it');
                try {
                    if (!window.__bajaLiveGraph && graph) window.__bajaLiveGraph = graph;
                    if (!window.__bajaLiveLayout && graph) window.__bajaLiveLayout = graph.genegraph_panel_layout || null;
                } catch (e) { }
                say('Playing ' + t.name + ' — ' + t.n_steps + ' step' + (t.n_steps === 1 ? '' : 's') + '…');
                // A step delay, unlike the recorder's own replay. This is being WATCHED
                // rather than verified: at full speed the screen changes faster than anyone
                // can see what changed it, which is the one thing a tutorial has to show.
                await exec('manchester/demo.js', t.script, { inPlace: true, stepDelayMs: (cfg.stepDelayMs != null ? cfg.stepDelayMs : 350) });
            } catch (e) {
                err('That tutorial could not be played: ' + (e && e.message ? e.message : e));
            }
        };

        // ---- SAVE -----------------------------------------------------------------------
        // A panel rather than a prompt: a name, a line about what it teaches, and who can
        // see it. The keywords are not asked for -- they come back FROM the save, and are
        // shown afterwards so what was derived is visible rather than mysterious.
        const savePanel = (script) => {
            try {
                const prev = document.getElementById('baja-tutorial-save');
                if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
            } catch (e) { }
            const n = (() => { try { const a = JSON.parse(script); return Array.isArray(a) ? a.filter((c) => c && c.cmd !== 'wait' && c.cmd !== 'setstate').length : 0; } catch (e) { return 0; } })();
            if (!n) { err('There is nothing recorded to save.'); return; }
            const wrap = document.createElement('div');
            wrap.id = 'baja-tutorial-save';
            wrap.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:2147483500;'
                + 'width:min(560px,92vw);background:#0b2545;color:#fff;border-radius:12px;'
                + 'box-shadow:0 12px 40px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.14);'
                + 'padding:16px;font:13px Arial,Helvetica,sans-serif;';
            const F = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;'
                + 'border:1px solid rgba(255,255,255,0.18);border-radius:8px;padding:9px 11px;font:13px Arial;';
            wrap.innerHTML = ''
                + '<div style="font:700 16px Arial;margin-bottom:3px;">Save this as a tutorial</div>'
                + '<div style="color:#9fb3c8;margin-bottom:13px;">' + n + ' step' + (n === 1 ? '' : 's')
                + (screenName ? ', recorded on the ' + esc(screenName === 'karyotype' ? 'genome viewer' : screenName) : '')
                + '. The keywords are read out of the operations themselves.</div>'
                + '<label style="display:block;font:600 12px Arial;color:#9fb3c8;margin:0 0 5px;">Name</label>'
                + '<input id="baja-tut-name" style="' + F + '" placeholder="What this teaches, in a few words"/>'
                + '<label style="display:block;font:600 12px Arial;color:#9fb3c8;margin:12px 0 5px;">Description <span style="font-weight:400;">(optional)</span></label>'
                + '<input id="baja-tut-desc" style="' + F + '" placeholder="One line about when someone would want it"/>'
                + '<label style="display:flex;align-items:center;gap:8px;margin:14px 0 0;color:#cfe3f2;cursor:pointer;">'
                + '<input id="baja-tut-shared" type="checkbox" checked style="width:16px;height:16px;accent-color:#2dd4bf;"/>'
                + 'Anyone signed in can find it</label>'
                + '<div id="baja-tut-out" style="margin-top:12px;color:#9fb3c8;"></div>'
                + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">'
                + '<button id="baja-tut-cancel" style="cursor:pointer;min-width:110px;height:34px;border-radius:8px;'
                + 'border:1px solid #b7c4d2;background:#fff;color:#0b2545;font:700 13px Arial;">Cancel</button>'
                + '<button id="baja-tut-save" style="cursor:pointer;min-width:110px;height:34px;border-radius:8px;'
                + 'border:1px solid #2dd4bf;background:#2dd4bf;color:#042f2e;font:700 13px Arial;">Save</button>'
                + '</div>';
            document.body.appendChild(wrap);
            const close = () => { try { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } catch (e) { } };
            const out = wrap.querySelector('#baja-tut-out');
            const nameEl = wrap.querySelector('#baja-tut-name');
            try { nameEl.focus(); } catch (e) { }
            wrap.querySelector('#baja-tut-cancel').onclick = () => { close(); say('Nothing was saved.'); };
            const doSave = async () => {
                const name = ('' + (nameEl.value || '')).trim();
                if (!name) { out.innerHTML = '<span style="color:#fca5a5;">It needs a name.</span>'; try { nameEl.focus(); } catch (e) { } return; }
                const btn = wrap.querySelector('#baja-tut-save');
                btn.disabled = true; btn.style.opacity = '0.6'; btn.textContent = 'Saving…';
                out.textContent = 'Reading the operations…';
                try {
                    const rs = await call({
                        __tool: 'save-tutorial.py', name: name,
                        description: ('' + (wrap.querySelector('#baja-tut-desc').value || '')).trim(),
                        script: script, screen: screenName, route: routeName,
                        visibility: wrap.querySelector('#baja-tut-shared').checked ? 'everyone' : 'me'
                    }, (m) => { try { out.textContent = '' + m; } catch (e) { } });
                    const kw = JSON.parse(rs.keywords || '[]');
                    const tp = JSON.parse(rs.topics || '[]');
                    close();
                    say('Saved "' + rs.name + '" — ' + rs.n_steps + ' step' + (rs.n_steps === 1 ? '' : 's')
                        + (kw.length ? ', keywords: ' + kw.slice(0, 8).join(', ') : '')
                        + (tp.length ? ' (' + tp.join(', ') + ')' : '') + '.');
                } catch (e) {
                    btn.disabled = false; btn.style.opacity = ''; btn.textContent = 'Save';
                    out.innerHTML = '<span style="color:#fca5a5;">' + esc('Could not save it: ' + (e && e.message ? e.message : e)) + '</span>';
                }
            };
            wrap.querySelector('#baja-tut-save').onclick = doSave;
            nameEl.onkeydown = (e) => { try { if (e.key === 'Enter') { e.preventDefault(); doSave(); } } catch (e2) { } };
        };

        // ---- BROWSE ---------------------------------------------------------------------
        // The same library every other list in this application uses, so a tutorial is found
        // the way a target or a track is: cards with a sentence each, searchable, one level
        // in for what can be done with one.
        const browse = async (query) => {
            let rows = [];
            try {
                const rs = await call({ screen: screenName, route: routeName, context: contextWords, query: query || '', limit: 60 },
                    (m) => say('' + m));
                rows = JSON.parse(rs.tutorials || '[]');
            } catch (e) {
                err('Tutorials could not be read: ' + (e && e.message ? e.message : e));
                return;
            }
            const me = (typeof getUser === 'function') ? ('' + (getUser() || '')).toLowerCase() : '';
            const here = rows.filter((t) => t.screen && screenName && t.screen === screenName);
            const elsewhere = rows.filter((t) => !(t.screen && screenName && t.screen === screenName));
            const whereWord = screenName === 'karyotype' ? 'the genome viewer' : (screenName ? 'the ' + screenName : 'this screen');
            const books = [];
            books.push({
                section: 'Tutorials for ' + whereWord, note: true,
                title: rows.length
                    ? (here.length
                        ? here.length + ' recording' + (here.length === 1 ? '' : 's') + ' made on ' + whereWord
                            + (elsewhere.length ? ', and ' + elsewhere.length + ' from elsewhere further down' : '')
                            + '. Each one plays back on the screen in front of you, step by step.'
                        : 'Nothing has been recorded on ' + whereWord + ' yet. ' + rows.length
                            + ' tutorial' + (rows.length === 1 ? '' : 's') + ' from other screens' + (rows.length === 1 ? ' is' : ' are') + ' below.')
                    : 'Nothing has been saved yet. Record what you do with the Record button, then save the script it hands back — the keywords come out of the operations themselves.'
            });
            const card = (t) => ({
                section: (t.screen === screenName && screenName) ? 'Tutorials for ' + whereWord : 'From other screens',
                title: t.name, accent: 'run',
                badge: (t.n_steps || 0) + ' step' + (t.n_steps === 1 ? '' : 's')
                    + (t.duration_ms ? ' · ' + human(t.duration_ms) : ''),
                icon: 'school', ready: true,
                blurb: (t.description ? t.description + ' ' : '')
                    + (t.topics && t.topics.length ? t.topics.join(', ') + '. ' : '')
                    + (t.why && t.why.length ? 'Matches ' + t.why.join(', ') + '. ' : '')
                    + (t.owner ? 'Saved by ' + (t.owner === me ? 'you' : t.owner) + ' ' + ago(t.updated) + '.' : ''),
                books: () => {
                    const sub = [
                        { title: 'Play it here', badge: 'play', icon: 'play_arrow', accent: 'run', ready: true,
                            blurb: 'Runs on the screen in front of you, one step at a time. Whatever it loads replaces what is loaded now.',
                            open: () => play(t.id, t.name) },
                        { note: true, title: 'Keywords read out of the operations: ' + ((t.keywords || []).join(', ') || 'none') },
                    ];
                    if (t.screen && t.screen !== screenName) sub.push({ note: true,
                        title: 'Recorded on ' + (t.screen === 'karyotype' ? 'the genome viewer' : 'the ' + t.screen)
                            + '. It will still play here, but the buttons it presses may not be on this screen.' });
                    if (t.owner && me && t.owner === me) sub.push({ title: 'Delete it', badge: 'remove', icon: 'delete_outline', ready: true,
                        blurb: 'Removes it for everyone. It cannot be undone.',
                        open: async () => {
                            try {
                                const ok = await exec('baja/lib/confirm-leave.js', {
                                    title: 'Delete ' + t.name + '?',
                                    message: 'The tutorial is removed for everyone who can see it. It cannot be undone.',
                                    confirmLabel: 'Delete', cancelLabel: 'Keep it'
                                });
                                if (!ok) return;
                                await call({ id: t.id, remove: true });
                                say('Deleted ' + t.name + '.');
                                browse(query);
                            } catch (e) { err('It could not be deleted: ' + (e && e.message ? e.message : e)); }
                        } });
                    return sub;
                }
            });
            here.forEach((t) => books.push(card(t)));
            if (elsewhere.length) {
                books.push({ section: 'From other screens', note: true,
                    title: 'Recorded somewhere else in the application. They are here because a tutorial you cannot see is a tutorial that does not exist — not because they will all make sense on this screen.' });
                elsewhere.forEach((t) => books.push(card(t)));
            }
            books.push({ section: 'Making one', note: true,
                title: 'Any recording can become a tutorial: press Record, do the thing once, press Stop, then Save as tutorial on the panel that appears. '
                    + 'The name is yours to write; the keywords are read out of what you did.' });
            // OR WRITE ONE, which is the other half of the same idea and reachable from the
            // same place: a recorded script is exact and unreadable, a written one is
            // readable and approximate, and both end as the same commands.
            books.push({ section: 'Making one', accent: 'design', title: 'Write one in words',
                badge: 'one line each', icon: 'edit_note', ready: true,
                blurb: 'Type what to do — click Analyze, zoom into TP53, wait 2s, say something — see exactly '
                    + 'what each line will do, then run it or save it as a tutorial.',
                open: () => { try { exec('manchester/text-script.js', { graph: graph }); } catch (e) { err('The script writer could not be opened: ' + (e && e.message ? e.message : e)); } } });
            try {
                exec('baja/lib/shelf.js', {
                    id: 'baja-tutorials', title: 'Tutorials',
                    subtitle: rows.length + ' saved  ·  ranked for ' + whereWord,
                    searchPlaceholder: 'Search tutorials…',
                    books: books, graph: graph
                });
            } catch (e) { err('The tutorial library could not be opened: ' + (e && e.message ? e.message : e)); }
        };

        const mode = ('' + (cfg.mode || 'browse')).toLowerCase();
        if (mode === 'save') savePanel('' + (cfg.script || ''));
        else if (mode === 'play' && cfg.id) await play(cfg.id, cfg.name);
        else await browse(cfg.query || '');
        return graph;
    })();
}
