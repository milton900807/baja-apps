function (config) {

    // text-script.js — direct the application by writing what to do, in words.
    //
    //   exec('manchester/text-script.js', { graph: graph })
    //
    // A recorded script is exact and unreadable: a hundred command objects full of
    // coordinates. This is the other end of the same road -- one instruction per line, in
    // the words someone would use to tell a colleague:
    //
    //     click box-zoom icon
    //     zoom into mutation
    //     click on mutation
    //     view menu
    //     type BRCA1 into search
    //     wait 2s
    //     say This is the loss matrix
    //
    // Each line is compiled to a manchester/demo.js command and the WHOLE COMPILATION IS
    // SHOWN BEFORE ANYTHING RUNS. That is the design: matching a description to a button is
    // a guess, and a guess that acts before it is read is how automation earns its
    // reputation. A line that cannot be compiled is marked rather than quietly dropped.
    //
    // HOW A TARGET IS FOUND. `click <something>` becomes a `near` locator, which demo.js
    // resolves by looking for the smallest pressable thing on screen whose label, tooltip,
    // aria-label or text contains all the words -- the way a person reads a screen, not the
    // way a recorder identifies an element.
    //
    // VERBS THAT HAVE NO BUTTON -- "zoom into the mutation on screen" -- are `action`
    // commands, which the current screen answers through the verbs it registers on
    // window.__bajaRecordHook.actions. A verb this screen does not have is reported when it
    // is compiled, not when it fails.

    return (async () => {
        const cfg = config || {};
        const graph = cfg.graph || (function () { try { return window.__bajaLiveGraph || null; } catch (e) { return null; } })();
        const say = (m) => { try { if (graph && graph.setMessage) graph.setMessage(' ' + m + ' '); } catch (e) { } };
        const esc = (s) => ('' + (s == null ? '' : s)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const hook = (function () { try { return window.__bajaRecordHook || null; } catch (e) { return null; } })();
        const actionsHere = (function () { try { return Object.keys((hook && hook.actions) || {}); } catch (e) { return []; } })();

        // ---- the compiler ---------------------------------------------------------------
        //
        // Deliberately small and deliberately literal. Every rule is a phrase somebody would
        // actually write, and anything it does not recognise says so rather than being
        // interpreted into something that looks similar.
        const STRIP = /^(the|a|an|on|onto|in|into|to|at|of)\s+/i;
        const clean = (t) => {
            let s = ('' + (t || '')).trim();
            // The words people put around a target that are not part of its name.
            s = s.replace(/^(on|the|a|an)\s+/i, '');
            s = s.replace(/\s+(icon|button|tab|menu item|item|control)$/i, '');
            s = s.replace(/\s+(on|in)\s+(the\s+)?(screen|toolbar|header|panel|page)$/i, '');
            return s.trim();
        };
        const ms = (t) => {
            const m = ('' + t).match(/([\d.]+)\s*(ms|s|sec|secs|seconds|second)?/i);
            if (!m) return 1000;
            const v = parseFloat(m[1]) || 0;
            const u = (m[2] || 's').toLowerCase();
            return Math.round(u === 'ms' ? v : v * 1000);
        };

        // name, test, build. First match wins, so the specific phrasings come first.
        const RULES = [
            ['wait', /^(?:wait|pause|hold)\s*(?:for\s+)?(.*)$/i,
                (m) => ({ cmd: 'wait', ms: ms(m[1] || '1s') })],
            ['say', /^(?:say|message|show message|note)\s+(.+)$/i,
                (m) => ({ cmd: 'message', text: m[1].trim() })],
            ['type', /^(?:type|enter|write|put)\s+(?:"([^"]+)"|'([^']+)'|(.+?))\s+(?:in|into|in the|into the)\s+(.+)$/i,
                (m) => ({ cmd: 'domset', locator: { by: 'near', v: clean(m[4]) }, value: (m[1] || m[2] || m[3] || '').trim() })],
            ['search', /^(?:search|search for|find)\s+(.+)$/i,
                (m) => ({ cmd: 'domset', locator: { by: 'near', v: 'search' }, value: m[1].trim() })],
            ['press key', /^(?:press|hit)\s+(enter|escape|esc|tab|backspace|delete)$/i,
                (m) => ({ cmd: 'key', key: ({ esc: 'Escape', escape: 'Escape', enter: 'Enter', tab: 'Tab', backspace: 'Backspace', delete: 'Delete' })[m[1].toLowerCase()] })],
            ['load', /^(?:load|open gene|add gene|add transcript)\s+(.+)$/i,
                (m) => ({ cmd: 'load', value: clean(m[1]) })],
            ['zoom', /^(?:zoom\s*(?:in(?:to)?|to)?|go to|goto|jump to|frame)\s+(.+)$/i,
                (m) => ({ cmd: 'action', name: 'zoom', arg: clean(m[1]) })],
            ['fit', /^(?:fit|fit all|zoom out|whole genome|show everything)$/i,
                () => ({ cmd: 'action', name: 'fit', arg: '' })],
            ['action', /^(?:do|run)\s+(.+)$/i,
                (m) => ({ cmd: 'action', name: clean(m[1]).toLowerCase(), arg: '' })],
            // Last, because almost anything else someone writes is a thing to press.
            ['click', /^(?:click|press|tap|choose|select|pick|open|show|view|go)\s*(?:on\s+)?(.+)$/i,
                (m) => ({ cmd: 'domclick', locator: { by: 'near', v: clean(m[1]) } })],
        ];

        const compile = (text) => {
            const out = [];
            ('' + (text || '')).split('\n').forEach((raw, i) => {
                const line = raw.replace(/\s+#.*$/, '').trim();
                if (!line || line.charAt(0) === '#') return;
                let hit = null;
                for (const r of RULES) {
                    const m = line.match(r[1]);
                    if (m) { hit = { rule: r[0], cmd: r[2](m) }; break; }
                }
                if (!hit) {
                    out.push({ n: i + 1, line: line, error: 'not an instruction this understands' });
                    return;
                }
                const rec = { n: i + 1, line: line, rule: hit.rule, cmd: hit.cmd };
                // An action the CURRENT screen does not offer is a problem to report now,
                // while the script is being written, rather than a step that does nothing
                // in the middle of a demonstration.
                if (hit.cmd.cmd === 'action' && actionsHere.length && actionsHere.indexOf(hit.cmd.name) < 0) {
                    rec.warn = 'this screen has no "' + hit.cmd.name + '" — it has ' + actionsHere.join(', ');
                }
                out.push(rec);
            });
            return out;
        };

        const describe = (r) => {
            if (r.error) return r.error;
            const c = r.cmd;
            switch (c.cmd) {
                case 'domclick': return 'click whatever reads "' + c.locator.v + '"';
                case 'domset': return 'type "' + c.value + '" into the field reading "' + c.locator.v + '"';
                case 'key': return 'press ' + c.key;
                case 'wait': return 'wait ' + (c.ms >= 1000 ? (c.ms / 1000) + 's' : c.ms + 'ms');
                case 'message': return 'show "' + c.text + '"';
                case 'load': return 'load ' + c.value;
                case 'action': return c.name + (c.arg ? ' ' + c.arg : '') + ' (this screen’s own)';
                default: return c.cmd;
            }
        };

        // ---- the panel ------------------------------------------------------------------
        try {
            const prev = document.getElementById('baja-text-script');
            if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
        } catch (e) { }
        const wrap = document.createElement('div');
        wrap.id = 'baja-text-script';
        wrap.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:2147483500;'
            + 'width:min(720px,94vw);max-height:86vh;overflow:auto;background:#0b2545;color:#fff;border-radius:12px;'
            + 'box-shadow:0 12px 40px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.14);'
            + 'padding:16px;font:13px Arial,Helvetica,sans-serif;';
        const EXAMPLE = cfg.text || ''
            + 'click Analyze\n'
            + 'wait 1s\n'
            + 'click Loss matrix\n'
            + 'say These are the genes this tumor has lost\n';
        wrap.innerHTML = ''
            + '<div style="font:700 16px Arial;margin-bottom:3px;">Write a script</div>'
            + '<div style="color:#9fb3c8;margin-bottom:12px;">One instruction per line. Compile it to see exactly what each line will do before it runs.'
            + (actionsHere.length ? ' This screen also knows: <b style="color:#cfe3f2;">' + esc(actionsHere.join(', ')) + '</b>.' : '')
            + '</div>'
            + '<textarea id="baja-ts-text" spellcheck="false" style="width:100%;height:190px;box-sizing:border-box;'
            + 'background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.18);border-radius:8px;padding:10px;'
            + 'font:12.5px/1.6 ui-monospace,Menlo,Consolas,monospace;resize:vertical;"></textarea>'
            + '<div id="baja-ts-out" style="margin-top:12px;"></div>'
            + '<div style="display:flex;gap:10px;align-items:center;margin-top:14px;flex-wrap:wrap;">'
            + '<span style="color:#9fb3c8;">step delay <input id="baja-ts-gap" type="number" value="500" min="0" step="100" '
            + 'style="width:74px;background:#0a1e3a;color:#fff;border:1px solid rgba(255,255,255,0.18);border-radius:6px;padding:4px;"/> ms</span>'
            + '<span style="flex:1;"></span>'
            + '<button id="baja-ts-help" style="cursor:pointer;min-width:96px;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,0.3);'
            + 'background:rgba(255,255,255,0.10);color:#fff;font:700 13px Arial;">What can I write?</button>'
            + '<button id="baja-ts-save" style="cursor:pointer;min-width:110px;height:34px;border-radius:8px;border:1px solid rgba(45,212,191,0.55);'
            + 'background:transparent;color:#5eead4;font:700 13px Arial;">Save as tutorial</button>'
            + '<button id="baja-ts-cancel" style="cursor:pointer;min-width:100px;height:34px;border-radius:8px;border:1px solid #b7c4d2;'
            + 'background:#fff;color:#0b2545;font:700 13px Arial;">Cancel</button>'
            + '<button id="baja-ts-compile" style="cursor:pointer;min-width:110px;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,0.42);'
            + 'background:rgba(255,255,255,0.14);color:#fff;font:700 13px Arial;">Compile</button>'
            + '<button id="baja-ts-run" style="cursor:pointer;min-width:110px;height:34px;border-radius:8px;border:1px solid #22c55e;'
            + 'background:#22c55e;color:#06230f;font:700 13px Arial;">Run ▶</button>'
            + '</div>';
        document.body.appendChild(wrap);
        const ta = wrap.querySelector('#baja-ts-text');
        ta.value = EXAMPLE;
        try { ta.focus(); } catch (e) { }
        const out = wrap.querySelector('#baja-ts-out');
        const close = () => { try { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } catch (e) { } };

        const showCompile = () => {
            const rows = compile(ta.value);
            if (!rows.length) { out.innerHTML = '<div style="color:#9fb3c8;">Nothing to compile yet.</div>'; return rows; }
            const bad = rows.filter((r) => r.error).length;
            const warn = rows.filter((r) => r.warn).length;
            out.innerHTML = '<div style="color:#9fb3c8;margin-bottom:6px;">'
                + rows.length + ' line' + (rows.length === 1 ? '' : 's')
                + (bad ? ' · <b style="color:#fca5a5;">' + bad + ' not understood</b>' : '')
                + (warn ? ' · <b style="color:#fcd34d;">' + warn + ' this screen cannot do</b>' : '')
                + (!bad && !warn ? ' · all understood' : '') + '</div>'
                + '<div style="border:1px solid rgba(255,255,255,0.12);border-radius:8px;overflow:hidden;">'
                + rows.map((r) => '<div style="display:flex;gap:10px;padding:6px 10px;border-top:1px solid rgba(255,255,255,0.07);'
                    + 'background:' + (r.error ? 'rgba(239,68,68,0.14)' : (r.warn ? 'rgba(251,191,36,0.12)' : 'transparent')) + ';">'
                    + '<span style="color:#64809c;min-width:22px;text-align:right;">' + r.n + '</span>'
                    + '<span style="flex:0 0 46%;color:#e8f0fb;font:12.5px ui-monospace,Menlo,Consolas,monospace;">' + esc(r.line) + '</span>'
                    + '<span style="flex:1;color:' + (r.error ? '#fca5a5' : (r.warn ? '#fcd34d' : '#9fb3c8')) + ';">'
                    + esc(r.warn || describe(r)) + '</span></div>').join('')
                + '</div>';
            return rows;
        };
        const commandsOf = (rows) => rows.filter((r) => !r.error).map((r) => r.cmd);

        wrap.querySelector('#baja-ts-compile').onclick = () => showCompile();
        wrap.querySelector('#baja-ts-cancel').onclick = () => { close(); say('Nothing was run.'); };
        wrap.querySelector('#baja-ts-help').onclick = () => {
            out.innerHTML = '<div style="border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px 12px;color:#cfe3f2;line-height:1.7;">'
                + '<b>click</b> / press / choose / open / view <i>whatever the thing says</i><br>'
                + '<b>type</b> BRCA1 <b>into</b> search &nbsp;&nbsp; · &nbsp;&nbsp; <b>search</b> BRCA1<br>'
                + '<b>zoom into</b> TP53 &nbsp;&nbsp; · &nbsp;&nbsp; <b>zoom into</b> mutation &nbsp;&nbsp; · &nbsp;&nbsp; <b>fit</b><br>'
                + '<b>load</b> ENST00000269305 &nbsp;&nbsp; · &nbsp;&nbsp; <b>press</b> Enter / Escape<br>'
                + '<b>wait</b> 2s &nbsp;&nbsp; · &nbsp;&nbsp; <b>say</b> anything you want on screen<br>'
                + '<span style="color:#9fb3c8;">A line starting with # is a comment. A target is matched by its words, so '
                + '"click box-zoom icon" finds the control whose tooltip contains box and zoom.</span>'
                + (actionsHere.length ? '<br><span style="color:#9fb3c8;">This screen also answers: ' + esc(actionsHere.join(', ')) + '</span>' : '')
                + '</div>';
        };
        wrap.querySelector('#baja-ts-run').onclick = async () => {
            const rows = showCompile();
            const cmds = commandsOf(rows);
            if (!cmds.length) { say('There is nothing this can run yet.'); return; }
            const gap = +(wrap.querySelector('#baja-ts-gap').value || 0);
            close();
            try {
                if (!window.__bajaLiveGraph && graph) window.__bajaLiveGraph = graph;
                if (!window.__bajaLiveLayout && graph) window.__bajaLiveLayout = graph.genegraph_panel_layout || null;
            } catch (e) { }
            try { await exec('manchester/demo.js', JSON.stringify(cmds), { inPlace: true, stepDelayMs: gap }); }
            catch (e) { say('The script stopped: ' + (e && e.message ? e.message : e)); }
        };
        wrap.querySelector('#baja-ts-save').onclick = () => {
            const rows = showCompile();
            const cmds = commandsOf(rows);
            if (!cmds.length) { say('There is nothing to save yet.'); return; }
            close();
            try { exec('manchester/tutorials.js', { mode: 'save', script: JSON.stringify(cmds), graph: graph }); }
            catch (e) { say('The tutorial panel could not be opened: ' + (e && e.message ? e.message : e)); }
        };
        showCompile();
        return graph;
    })();
}
