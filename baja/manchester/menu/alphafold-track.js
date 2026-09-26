function (graph, genegraph_panel_layout, track) {

    // FOLD THIS TRACK'S PROTEIN, and show the structure.
    //   await exec('baja/manchester/menu/alphafold-track.js', graph, genegraph_panel_layout, track)
    //
    // WHAT GETS FOLDED is decided by the track, not asked for:
    //   a sequence is selected  ->  the residues of the ORF inside that selection
    //   nothing is selected     ->  the whole ORF
    // Those are the only two things a track can mean by "this protein", and picking the
    // selection when there is one is what every other per-track tool here already does. The
    // menu label says which of the two it will be BEFORE it is clicked, because the two give
    // very different structures and a selection made ten minutes ago is easy to forget.
    //
    // WHY NOT REUSE the runner in load_seleced_sequence_menulist.js: its retry calls itself
    // and throws the returned value away, so a job that fell back to the CPU queue reported
    // nothing; its catch reads an `exception` that is not in scope; and it folds every marked
    // track on the board rather than one. This does one track, awaits its own fallback, and
    // returns what it got.

    return (async () => {
        const L = genegraph_panel_layout;
        // THE CANVAS DOES NOT PAINT setMessage. Only setResultMessage and setMessageCenter
        // reach the screen, so a fold reporting its progress through setMessage -- which is
        // what the older runner does -- spends several minutes looking like nothing at all is
        // happening, and then says nothing when it fails either.
        //   say()  terminal outcomes, as a toast
        //   tick() the running clock, in the centre, where it replaces itself rather than
        //          stacking one toast every three seconds
        const say = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } } };
        const tick = (m) => {
            try { graph.setMessageCenter(m); } catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } }
        };
        const clearTick = () => { try { graph.setMessageCenter(''); } catch (e) { } };

        // Azure GPU first, its CPU twin as the fallback. The CPU queue is slower but it is
        // there when the GPU host is occupied, which it often is.
        const GPU = 'https://gpu.hts.bio/alphafold/';
        const CPU = 'https://gpu.hts.bio/alphafoldcpu/';
        const MAX_RESIDUES = 2254;   // the service's own ceiling
        const MIN_RESIDUES = 16;     // below this a prediction says nothing worth drawing

        if (!track) { say('Select a track first.'); return null; }

        // ---- what to fold ---------------------------------------------------------------
        const scope = peptideForTrack(track);
        if (scope.error) { say(scope.error); return null; }
        const peptide = scope.peptide;

        if (peptide.length < MIN_RESIDUES) {
            say(scope.what + ' is only ' + peptide.length + ' residue' + (peptide.length === 1 ? '' : 's')
                + ' — too short to fold into anything meaningful.');
            return null;
        }
        if (peptide.length > MAX_RESIDUES) {
            say(scope.what + ' is ' + peptide.length + ' residues; the folding service stops at '
                + MAX_RESIDUES + '. Select a domain and fold that.');
            return null;
        }

        // ---- confirm, with the sequence in front of them --------------------------------
        const go = await confirmFold(peptide, scope, track);
        if (!go) { say('Folding cancelled.'); return null; }

        // ---- run -------------------------------------------------------------------------
        const jobName = safeJobName(peptide);
        say('Folding ' + peptide.length + ' residues from ' + (track.name || 'the track')
            + ' — this takes from a few seconds to several minutes.');
        try { graph.setMessageCenter('AlphaFold · ' + (track.name || 'track')); } catch (e) { }
        try { graph.___folder_calculation = true; } catch (e) { }

        let out = null;
        try {
            out = await submitAndWait(GPU, jobName, peptide, 'AlphaFold / GPU');
            if (!out || !out.pdbUrl) {
                say('The GPU queue did not answer — trying the CPU queue.');
                out = await submitAndWait(CPU, jobName, peptide, 'AlphaFold / CPU');
            }
        } catch (e) {
            try { graph.___folder_calculation = false; } catch (e2) { }
            clearTick();
            say('Folding failed: ' + (e && e.message ? e.message : e));
            return null;
        }
        try { graph.___folder_calculation = false; } catch (e) { }
        clearTick();

        if (!out || !out.pdbUrl) {
            // NAME THE SERVICE. "No structure came back" reads as a fault in the track or
            // the sequence; the folding host is a separate machine, and when it is down that
            // is the fact worth having.
            say('No structure came back — the folding service (gpu.hts.bio) is not answering. '
                + 'Nothing is wrong with the sequence; try again when it is back.');
            return null;
        }

        // ---- the protein view -------------------------------------------------------------
        showStructure(out.pdbUrl, scope, peptide, track);
        say('Folded ' + peptide.length + ' residues of ' + (track.name || 'the track') + '.');
        return out;

        // ==================================================================================

        // A TRACK'S PROTEIN, and which part of it. Returns { peptide, what, selected }.
        //
        // The selected case reads the ORF rather than the bases: a selection is a span of
        // NUCLEOTIDES, and folding whatever three-frame translation happens to fall out of it
        // would be a different protein from the one the track draws. getPeptideFromORF walks
        // this.orf.cdsi, so the residues are the track's own, in its own frame, exon-aware.
        function peptideForTrack(t) {
            let orf = null;
            try { orf = t.orf && t.orf.cdsi && t.orf.cdsi.length ? t.orf : null; } catch (e) { orf = null; }
            if (!orf) {
                // Best-effort: a track that was never asked for its ORF still has one to find.
                try { if (typeof t.generateORF === 'function') t.generateORF(); } catch (e) { }
                try { orf = t.orf && t.orf.cdsi && t.orf.cdsi.length ? t.orf : null; } catch (e) { orf = null; }
            }
            if (!orf) return { error: (t.name || 'This track') + ' has no coding sequence to fold.' };

            let range = null;
            try { range = (typeof t.selectedRange === 'function') ? t.selectedRange() : null; } catch (e) { range = null; }

            if (range) {
                let pep = '';
                try { pep = ('' + (t.getPeptideFromORF(range.start, range.end) || '')).trim(); } catch (e) { pep = ''; }
                if (!pep) {
                    return {
                        error: 'The selected sequence holds no coding bases — it is outside the ORF. '
                            + 'Clear the selection to fold the whole protein.'
                    };
                }
                return { peptide: pep, selected: true, what: 'The selected sequence' };
            }

            let whole = '';
            try { whole = ('' + (t.getProteinSequence() || '')).trim(); } catch (e) { whole = ''; }
            if (!whole) return { error: (t.name || 'This track') + ' has an ORF but no protein could be read from it.' };
            return { peptide: whole, selected: false, what: 'This protein' };
        }

        // The sequence, in a text editor, before anything is sent anywhere. Folding is minutes
        // of someone else's GPU, and the one thing worth checking first is that the residues
        // are the ones meant -- which is a thing you check by reading them, not by being told
        // how many there are.
        function confirmFold(pep, sc, t) {
            return new Promise((resolve) => {
                let done = false;
                const finish = (v) => { if (done) return; done = true; try { hideAllModal(); } catch (e) { } resolve(v); };
                showModal({
                    wid: 'card',
                    componentRef: 'bottomPanel',
                    data: {
                        cards: [[
                            {
                                title: '', width: '100%',
                                component: {
                                    wid: 'html',
                                    data: '<div style="font:600 13px system-ui,Segoe UI,Arial;color:#0a2540;">'
                                        + esc(t.name || 'Track') + ' &middot; ' + esc(sc.what.toLowerCase())
                                        + '</div><div style="font:12px system-ui,Segoe UI,Arial;color:#5b7288;margin-top:3px;">'
                                        + pep.length + ' residues'
                                        + (sc.selected ? ' from the selected range' : ' — the whole open reading frame')
                                        + ' &middot; folded on an external service, which can take several minutes.</div>'
                                }
                            },
                            {
                                title: '', width: '100%', height: '300px',
                                component: {
                                    wid: 'text-editor', height: '300px',
                                    data: { height: '300px', showButton: false, title: 'Sequence', text: String(pep) }
                                }
                            },
                            {
                                title: '', width: '100%',
                                component: {
                                    wid: 'mt-button',
                                    data: {
                                        buttons: [
                                            { label: 'Cancel', ionFunction: createIonFunction(() => finish(false)) },
                                            { label: 'Fold it', ionFunction: createIonFunction(() => finish(true)) }
                                        ]
                                    }
                                }
                            }
                        ]]
                    }
                });
            });
        }

        // Submit, then poll the job's own file listing until a .pdb appears. Returns
        // { pdbUrl, logUrl, filesUrl } or null -- null means "this queue gave nothing",
        // which is the caller's cue to try the other one.
        async function submitAndWait(baseUrl, name, pep, label) {
            const join = (b, p) => new URL(p, String(b).endsWith('/') ? b : b + '/').toString();
            let res = null;
            try { res = await POSTJSON({ job_name: name, sequence: pep }, join(baseUrl, 'predict')); }
            catch (e) { say(label + ' could not be reached.'); return null; }
            // POSTJSON RESOLVES WITH THE ERROR rather than rejecting (baja/src/app/engine/
            // io-db.ts: its catchError calls resolve(error)), so a service that is down
            // arrives here as a perfectly ordinary value carrying an `error` field -- and,
            // because that same catchError returns null into the pipe, with a stray RxJS
            // "you provided 'null' where a stream was expected" on the console that has
            // nothing to do with this job. A missing results_url is the reliable tell.
            if (!res || res.error || !res.results_url) {
                say(label + ' is not answering' + (res && res.status ? (' (HTTP ' + res.status + ')') : '') + '.');
                return null;
            }

            const filesUrl = baseUrl + res.results_url;
            const logUrl = res.log_url ? (baseUrl + res.log_url) : '';
            const POLL_MS = 3000, MAX_TRIES = 300;   // ~15 minutes

            for (let i = 0; i < MAX_TRIES; i++) {
                let files = null;
                try {
                    const r = await fetch(filesUrl);
                    if (r.ok) files = await r.json();
                } catch (e) { /* a queue that blinks is not a failure; keep waiting */ }

                if (Array.isArray(files)) {
                    const hit = files.find((f) => ('' + f).toLowerCase().endsWith('.pdb'));
                    if (hit) return { pdbUrl: join(filesUrl + '/', hit), logUrl: logUrl, filesUrl: filesUrl };
                }
                const secs = Math.floor((i * POLL_MS) / 1000);
                const status = label + '  ' + String(Math.floor(secs / 60)).padStart(2, '0')
                    + ':' + String(secs % 60).padStart(2, '0');
                try { graph.___folder_calculation_status = status; } catch (e) { }
                tick(status);
                await new Promise((r) => setTimeout(r, POLL_MS));
            }
            say(label + ' did not finish in time.');
            return null;
        }

        // THE PROTEIN VIEW. The structure takes the main panel -- it is the thing that was
        // just waited minutes for, and a 600x800 modal over the canvas is not where anyone
        // wants to turn a fold over. Close puts the editor back exactly as it was.
        function showStructure(pdbUrl, sc, pep, t) {
            const title = (t.name || 'Track') + '  ·  ' + pep.length + ' residues'
                + (sc.selected ? '  ·  selected range' : '  ·  whole ORF');
            const layout = {
                wid: 'card-column',
                height: '100%',
                data: {
                    cards: [
                        [{
                            width: '100%', height: '100%',
                            'style.padding-top': '4px',
                            title: title,
                            component: { wid: 'molstar', data: { url: pdbUrl }, label: (t.name || 'Track') }
                        }],
                        [{
                            title: '', width: '100%',
                            component: {
                                wid: 'mt-button',
                                data: {
                                    buttons: [
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                try { hideAllModal(); } catch (e) { }
                                                setTimeout(() => {
                                                    try {
                                                        CurrentLayout.clearComponent('mainPanel');
                                                        CurrentLayout.setComponent('mainPanel', L);
                                                    } catch (e) { }
                                                    // The hover handler goes back on with the canvas;
                                                    // without it the track menu is dead on return.
                                                    try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, L); } catch (e) { }
                                                }, 250);
                                            })
                                        },
                                        {
                                            label: 'Open the PDB', ionFunction: createIonFunction(() => {
                                                try { window.open(pdbUrl, '_blank', 'noopener'); } catch (e) { }
                                            })
                                        }
                                    ]
                                }
                            }
                        }]
                    ]
                }
            };
            try {
                CurrentLayout.clearComponent('mainPanel');
                CurrentLayout.setComponent('mainPanel', layout);
            } catch (e) {
                // Whatever happens to the panel, the structure itself must still be reachable.
                try { showModal({ wid: 'molstar', data: { url: pdbUrl } }, 600, 800); } catch (e2) { }
            }
        }

        // One job name per user per peptide, so re-folding the same protein does not queue a
        // second identical job. A plain 32-bit rolling hash: this names a job, it does not
        // protect anything.
        function safeJobName(pep) {
            let h = 2166136261;
            for (let i = 0; i < pep.length; i++) { h ^= pep.charCodeAt(i); h = Math.imul(h, 16777619); }
            let who = '';
            try { who = ('' + (getUser() || 'anon')); } catch (e) { who = 'anon'; }
            who = who.replace(/[^A-Za-z0-9]+/g, '').slice(0, 24) || 'anon';
            return who + '_' + (h >>> 0).toString(36) + '_' + pep.length;
        }

        function esc(s) {
            return ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
    })();
}
