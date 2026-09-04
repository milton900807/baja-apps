function (graph, genegraph_panel_layout, oligos) {

    // "Describe the chemistry" -- a floating prompt window in the same shape as the editor's
    // "Play a script" panel (manchester/editor.js's openPlayScriptPanel): a fixed overlay
    // with a title, a hint, one big textarea and Cancel / Apply. The user says in plain
    // language what chemistry they want; each SELECTED compound's sequence, current HELM,
    // and own properties go to the Anthropic-backed designer along with the monomer library
    // (baja/chem/monomers.js), and the returned HELM is applied to that compound.
    //   exec('baja/chem/ui/describe-chemistry-window.js', graph, genegraph_panel_layout)
    //   exec('baja/chem/ui/describe-chemistry-window.js', graph, genegraph_panel_layout, someOligos)
    //
    // The BASES NEVER CHANGE: only the sugars, linkers and modifications around them do.
    // That is stated to the model, enforced server-side in design-helm-chemistry.py (which
    // compares the bases coming back against the bases going in and refuses a mismatch), and
    // checked once more here against the compound's own sequence before anything is written.

    return new Promise(async (resolve) => {

        // What "selected" means, most specific first: the canvas selection window
        // (__lassoSelection, what the selection library itself reads), then anything a
        // caller handed in, then oligos individually flagged selected, then -- only if
        // nothing at all is selected -- every compound on the canvas, said out loud.
        const collect = () => {
            const out = [];
            const push = (o, t) => { if (o && out.indexOf(o) < 0) { out.push(o); if (t) { try { o.__track = o.__track || t; } catch (e) { } } } };

            if (oligos) {
                for (const o of (Array.isArray(oligos) ? oligos : [oligos])) push(o);
                if (out.length) return { list: out, scope: 'the compound' + (out.length === 1 ? '' : 's') + ' you picked' };
            }
            try {
                for (const s of (graph.__lassoSelection || [])) {
                    if (s && (s.kind === 'oligo' || s.kind === 'amplicon') && s.ref) push(s.ref, s.track);
                }
            } catch (e) { }
            if (out.length) return { list: out, scope: 'the selected compound' + (out.length === 1 ? '' : 's') };

            try {
                for (const t of (graph.track || [])) for (const o of (t.oligos || [])) if (o && o.selected) push(o, t);
            } catch (e) { }
            if (out.length) return { list: out, scope: 'the selected compound' + (out.length === 1 ? '' : 's') };

            try {
                for (const t of (graph.track || [])) for (const o of (t.oligos || [])) push(o, t);
            } catch (e) { }
            return { list: out, scope: 'ALL ' + out.length + ' compound' + (out.length === 1 ? '' : 's') + ' on the canvas (nothing is selected)' };
        };

        const { list, scope } = collect();
        if (!list.length) {
            try { graph.setResultMessage(' No compounds to apply chemistry to -- design or paste one first. '); } catch (e) { }
            resolve(null);
            return;
        }

        let monomersRaw = null;
        try { monomersRaw = await exec('baja/chem/monomers.js'); } catch (e) { monomersRaw = null; }
        const monomers = (monomersRaw && (monomersRaw.monomers || monomersRaw)) || [];
        let Biopolymer = null;
        try { Biopolymer = await exec('baja/chem/biopolymer.js'); } catch (e) { Biopolymer = null; }

        // The bases of a HELM string -- what is inside each (...) -- so a returned structure
        // can be checked against the sequence it is supposed to keep.
        const basesOf = (helm) => {
            try { if (Biopolymer && Biopolymer.getSequence) return ('' + Biopolymer.getSequence(helm || '')).toUpperCase(); } catch (e) { }
            return (('' + (helm || '')).match(/\(([^)]*)\)/g) || []).join('').replace(/[()]/g, '').toUpperCase();
        };
        const asDNA = (s) => ('' + (s || '')).toUpperCase().replace(/U/g, 'T');

        // The compound's own properties, as context for the request ("make the antisense
        // strand a gapmer" needs to know which strand this is). Scalars only: the nested
        // fields are render state and off-target hit lists, which would bury the rest.
        const propsOf = (o) => {
            const out = {};
            try {
                for (const k of Object.keys(o)) {
                    if (k.indexOf('__') === 0) continue;
                    const v = o[k];
                    if (v === null || v === undefined) continue;
                    if (typeof v === 'object' || typeof v === 'function') continue;
                    if (k === 'structure' || k === 'sequence') continue;   // sent separately
                    out[k] = v;
                }
            } catch (e) { }
            return out;
        };

        const esc = (s) => ('' + (s || '')).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

        try {
            const prev = document.getElementById('baja-chem-panel');
            if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
            const wrap = document.createElement('div');
            wrap.id = 'baja-chem-panel';
            wrap.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:2147483000;width:min(640px,92vw);background:#0b2545;color:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.14);font:13px system-ui,Arial;padding:14px;';
            wrap.innerHTML = ''
                + '<div style="font-weight:700;margin-bottom:4px;">⚗ Describe the chemistry</div>'
                + '<div style="opacity:.7;margin-bottom:8px;font-size:12px;">Say what chemistry you want for ' + esc(scope)
                + '. The bases never change &mdash; only the sugars, linkers and modifications around them.</div>'
                + '<textarea id="baja-chem-text" spellcheck="false" placeholder="e.g. 5-10-5 gapmer: 2\'-MOE wings, DNA core, phosphorothioate throughout" style="width:100%;height:150px;box-sizing:border-box;background:#0a1e3a;color:#e8eef6;border:1px solid rgba(255,255,255,0.18);border-radius:8px;padding:10px;font:12px ui-monospace,Menlo,Consolas,monospace;resize:vertical;"></textarea>'
                + '<div id="baja-chem-status" style="min-height:18px;margin-top:8px;font-size:12px;opacity:.85;"></div>'
                + '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;">'
                + '  <span style="flex:1;opacity:.6;font-size:11.5px;">' + list.length + ' compound' + (list.length === 1 ? '' : 's') + '</span>'
                + '  <button id="baja-chem-cancel" style="background:transparent;color:#cbd5e1;border:1px solid rgba(255,255,255,0.25);border-radius:999px;padding:7px 16px;cursor:pointer;">Cancel</button>'
                + '  <button id="baja-chem-run" style="background:#22c55e;color:#06230f;font-weight:700;border:none;border-radius:999px;padding:7px 20px;cursor:pointer;">Apply ⚗</button>'
                + '</div>';
            document.body.appendChild(wrap);

            const ta = document.getElementById('baja-chem-text'); try { ta.focus(); } catch (e) { }
            const statusEl = document.getElementById('baja-chem-status');
            const setStatus = (html) => { try { if (statusEl) statusEl.innerHTML = html; } catch (e) { } };
            const close = () => { try { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } catch (e) { } };

            document.getElementById('baja-chem-cancel').onclick = () => { close(); resolve(null); };

            document.getElementById('baja-chem-run').onclick = async () => {
                const promptText = ('' + (ta.value || '')).trim();
                if (!promptText) { setStatus('<span style="color:#fca5a5;">Describe the chemistry you want first.</span>'); return; }

                const runBtn = document.getElementById('baja-chem-run');
                try { runBtn.disabled = true; runBtn.style.opacity = '.6'; } catch (e) { }

                let applied = 0;
                const failures = [];
                for (let i = 0; i < list.length; i++) {
                    const o = list[i];
                    const label = o.name || o.id || ('compound ' + (i + 1));
                    setStatus('Designing ' + esc(label) + '… (' + (i + 1) + '/' + list.length + ')');

                    // The sequence this compound must keep: its own if it has one, else
                    // whatever its current structure already encodes.
                    const keep = asDNA(o.sequence || basesOf(o.structure));

                    let res = null;
                    try {
                        res = await exec('baja/manchester/menu/design-helm-from-prompt.js',
                            o.structure || '', promptText, monomers, o.sequence || basesOf(o.structure), propsOf(o));
                    } catch (e) {
                        failures.push(label + ': ' + (e && e.message ? e.message : e));
                        continue;
                    }
                    if (!res || res.error || !res.helm) {
                        failures.push(label + ': ' + ((res && res.error) || 'no structure returned'));
                        continue;
                    }

                    // Last line of defence on the sequence, after the model was told and the
                    // python side already checked: if the bases moved, this compound is left
                    // exactly as it was.
                    const got = asDNA(basesOf(res.helm));
                    if (keep && got && keep !== got) {
                        failures.push(label + ': sequence would have changed — skipped');
                        continue;
                    }

                    let helm = res.helm;
                    try { if (Biopolymer && Biopolymer.normalizeStructure) helm = Biopolymer.normalizeStructure(helm) || helm; } catch (e) { }
                    o.structure = helm;
                    applied++;
                }

                try { if (graph.wake) graph.wake(); } catch (e) { }
                close();

                const msg = ' Chemistry applied to ' + applied + ' of ' + list.length + ' compound'
                    + (list.length === 1 ? '' : 's') + '.'
                    + (failures.length ? ' ' + failures.length + ' skipped: ' + failures[0]
                        + (failures.length > 1 ? ' (+' + (failures.length - 1) + ' more)' : '') : '') + ' ';
                try { if (applied) graph.setResultMessage(msg); else graph.setError(msg); } catch (e) { }
                resolve({ applied: applied, total: list.length, failures: failures });
            };
        } catch (e) {
            try { graph.setError(' Could not open the chemistry window: ' + e + ' '); } catch (e2) { }
            resolve(null);
        }
    });
}
