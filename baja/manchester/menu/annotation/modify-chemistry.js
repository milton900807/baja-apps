function (graph, genegraph_panel_layout, oligos, trackHint) {

    // "Modify Chemistry": a free-text description of a desired chemistry change (sugars,
    // linkers, backbone, modifications), sent along with the target oligo's sequence, its
    // current HELM structure, and the editor's monomer library to the Anthropic-backed
    // script the HELM editor's own (currently unwired) "Design" button already targets --
    // baja/manchester/menu/design-helm-from-prompt.js -> py/sequence/design-helm-chemistry.py
    // -- which returns an updated HELM structure. Applied back onto the oligo (.structure)
    // when the user accepts it.
    //
    // `oligos` (optional) -- a caller that already knows which oligo(s) this applies to
    // (a per-oligo/per-track menu, e.g. mouse-over-highlight.js's compound actions, or one
    // of flexigraph/gene.js's oligo/amplicon context menus) passes it directly: a single
    // Oligo, or an array of them. `trackHint` (optional) names the track they came from,
    // for the picker label when more than one candidate is passed. Omit both to fall back
    // to scanning every oligo on every track on the canvas -- the right default for a
    // GLOBAL entry point (a toolbar button) that has no specific oligo in hand.
    //   exec('baja/manchester/menu/annotation/modify-chemistry.js', graph, genegraph_panel_layout)
    //   exec('baja/manchester/menu/annotation/modify-chemistry.js', graph, genegraph_panel_layout, oneOligo)
    //   exec('baja/manchester/menu/annotation/modify-chemistry.js', graph, genegraph_panel_layout, severalOligos, track)

    return new Promise(async (resolve) => {

        const showEditorCanvas = () => {
            try { CurrentLayout.clearComponent('mainPanel'); } catch (e) { }
            try { CurrentLayout.setComponent('mainPanel', genegraph_panel_layout); } catch (e) { }
        };

        let candidates = [];
        if (oligos) {
            // Caller already knows the oligo(s) -- use exactly those, tagged with
            // whatever track context was given (falls back to each oligo's own .track if
            // it carries one, which some do).
            const list = Array.isArray(oligos) ? oligos : [oligos];
            for (const o of list) {
                if (o) candidates.push({ track: trackHint || o.track || null, oligo: o });
            }
        } else {
            // No oligo given -- every oligo on every track. There is no live "select an
            // oligo" convention this app already has to reuse for a HELM-editing tool --
            // every existing caller that needed one (select-structure.js,
            // select-structure-simple.js, menu-for-single-aso.js) is commented out
            // elsewhere in this codebase -- so this asks directly whenever there is more
            // than one candidate, rather than guessing which one was meant.
            for (const t of (graph.track || [])) {
                for (const o of (t.oligos || [])) {
                    if (o) candidates.push({ track: t, oligo: o });
                }
            }
        }
        if (!candidates.length) {
            infoPrompt(' No compound/oligo on the canvas to modify -- paste a sequence or design one first. ');
            resolve(null);
            return;
        }

        const openFor = async (entry) => {
            const oligo = entry.oligo;
            const Biopolymer = await exec('baja/chem/biopolymer.js');
            let monomersRaw = null;
            try { monomersRaw = await exec('baja/chem/monomers.js'); } catch (e) { monomersRaw = null; }
            const monomers = (monomersRaw && (monomersRaw.monomers || monomersRaw)) || [];

            let promptBox = null;      // the textarea widget instance
            let statusEl = null;       // an html widget's live ref, for status text

            const setStatus = (html) => { try { if (statusEl) statusEl.html = html; } catch (e) { } };

            const escapeHtml = (s) => ('' + (s || '')).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
            const truncate = (s, n) => (s && s.length > n) ? (s.slice(0, n) + '…') : (s || '(none)');

            const runDesign = async () => {
                let promptText = '';
                try { promptText = (promptBox && promptBox.getWidgetValue) ? promptBox.getWidgetValue() : (promptBox && promptBox.value ? promptBox.value : ''); } catch (e) { }
                promptText = ('' + (promptText || '')).trim();
                if (!promptText) { setStatus('<font color="red">Describe the chemistry change you want first.</font>'); return; }

                setStatus('Designing chemistry…');
                let res;
                try {
                    res = await exec('baja/manchester/menu/design-helm-from-prompt.js',
                        oligo.structure || '', promptText, monomers, oligo.sequence || '');
                } catch (e) {
                    setStatus('<font color="red">Failed: ' + (e && e.message ? e.message : e) + '</font>');
                    return;
                }
                if (!res || res.error) {
                    setStatus('<font color="red">' + escapeHtml((res && res.error) || 'No result') + '</font>');
                    return;
                }
                if (!res.helm) {
                    setStatus('<font color="red">The model did not return a HELM structure.</font>');
                    return;
                }

                let normalized = res.helm;
                try { normalized = Biopolymer.normalizeStructure(res.helm) || res.helm; } catch (e) { }
                oligo.structure = normalized;
                try { if (graph.wake) graph.wake(); } catch (e) { }

                setStatus('<font color="green">Applied' + (res.notes ? ' — ' + escapeHtml(res.notes) : '') + '.</font>');
                setTimeout(() => {
                    showEditorCanvas();
                    graph.setResultMessage(' Updated chemistry for ' + (oligo.name || 'the oligo')
                        + (res.notes ? ': ' + res.notes : '.') + ' ');
                    resolve({ oligo: oligo, helm: normalized, notes: res.notes || '' });
                }, 900);
            };

            const panel = {
                wid: 'card',
                componentRef: 'mainPanel',
                data: {
                    height: '100%',
                    cards: [[
                        {
                            width: '100%',
                            component: {
                                wid: 'html',
                                data: '<h3>Modify Chemistry — ' + escapeHtml(oligo.name || (entry.track && entry.track.name) || 'oligo') + '</h3>'
                                    + '<p>Sequence: <code>' + escapeHtml(oligo.sequence || '(none)') + '</code></p>'
                                    + '<p>Current chemistry: <code style="word-break:break-all;">'
                                    + escapeHtml(truncate(oligo.structure, 200)) + '</code></p>'
                            }
                        },
                        {
                            title: 'Describe the chemistry change',
                            width: '100%',
                            component: {
                                wid: 'input-textarea-editor',
                                data: {
                                    showButton: false,
                                    title: 'Chemistry',
                                    ionHookFunction: createIonFunction((input_box) => { promptBox = input_box; })
                                }
                            }
                        },
                        {
                            title: '',
                            width: '100%',
                            component: {
                                wid: 'html',
                                data: `e.g. "add 2'-MOE wings on the first and last 3 bases with a phosphorothioate backbone throughout", "make this a fully 2'-OMe gapmer, 5-10-5 MOE/DNA/MOE design"`
                            }
                        },
                        {
                            width: '100%',
                            component: {
                                wid: 'html',
                                refCallback: createIonFunction((ref) => { statusEl = ref; }),
                                data: ''
                            }
                        },
                        {
                            title: '',
                            width: '100%',
                            component: {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        { label: 'Generate', ionFunction: createIonFunction(async () => { await runDesign(); }) },
                                        { label: 'Cancel', ionFunction: createIonFunction(() => { showEditorCanvas(); resolve(null); }) }
                                    ]
                                }
                            }
                        }
                    ]]
                }
            };
            try { CurrentLayout.clearComponent('mainPanel'); } catch (e) { }
            try { CurrentLayout.setComponent('mainPanel', panel); } catch (e) { }
        };

        if (candidates.length === 1) {
            await openFor(candidates[0]);
        } else {
            // Pick which oligo, the same on-canvas side-menu idiom the rest of the
            // Annotations tools (annotation-tools2.js) already uses.
            const items = candidates.map((c) => ({
                label: (c.oligo.name || 'oligo') + ((c.track && c.track.name) ? ('  (' + c.track.name + ')') : ''),
                move: () => { },
                click: () => openFor(c)
            }));
            items.push({ label: 'Cancel', move: () => { }, click: () => resolve(null) });
            try { graph.showSideMenu(items); } catch (e) { await openFor(candidates[0]); }
        }
    });
}
