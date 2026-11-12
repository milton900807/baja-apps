function (graph, genegraph_panel_layout, presetTrack) {
    // Uniqueness / repeat gradient laid over a transcript track as a coverage layer.
    //   exec('baja/data/uniqueness-gradient.js', graph, genegraph_panel_layout [, track])
    //
    // For every window of size k (3-30) along the track, two things are scored and kept
    // apart, because they fail independently and a single number hides which one fired:
    //
    //   complexity  the window on its own -- composition entropy, longest homopolymer,
    //               strongest tandem periodicity, triplet redundancy. No reference.
    //   uniqueness  how often the window occurs outside the target gene, taken from the
    //               off-target indexes baja-server already builds per species
    //               (py/sequence/offtarget). Hits inside the named gene symbol are
    //               on-target, which covers the transcript itself AND its orthologue in
    //               every other species, so a conserved window does not read as an
    //               off-target in mouse.
    //
    // The layer drawn is the product, complexity x 1/(1+worst off-target). The summary
    // panel reports which of the two pulled any region down.
    //
    // presetTrack: the track to scan, decided by whoever opened this. Given, it runs on
    // that track at once; without it the click-a-track flow below stands, matching
    // baja/data/aso-offtarget.js. The models library hands a LIST (always one element --
    // __onParentTrack resolves the choice before calling), so accept either shape.
    return new Promise(async (resolve, reject) => {
        if (Array.isArray(presetTrack)) presetTrack = presetTrack.filter(Boolean)[0] || null;
        const server = window['env']['apiUrl'];
        const PY = server + '/py/sequence/offtarget/uniqueness-gradient.py';

        // The five species an oligo programme usually has to clear: the clinical one and
        // the tox panel. Keys are resolved to index names on the python side, which skips
        // any species whose index this server has not built and says so in `warnings`.
        const SPECIES = [
            { key: 'human', label: 'human', on: true },
            { key: 'dog', label: 'dog', on: true },
            { key: 'mouse', label: 'mouse', on: true },
            { key: 'rat', label: 'rat', on: true },
            { key: 'cyno', label: 'cyno (NHP)', on: true }
        ];

        const esc = (s) => ('' + s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // ---- panel chrome, same shell as baja/data/load-variant-track.js ----------------
        const btn = (id, label, primary) =>
            '<button id="' + id + '" style="border:0;border-radius:8px;padding:9px 16px;'
            + 'font:600 13px Arial;cursor:pointer;'
            + (primary ? 'background:#2a78d6;color:#fff;' : 'background:rgba(255,255,255,0.12);color:#e8f0fb;')
            + '">' + esc(label) + '</button>';

        const shell = (opts) => {
            const panel = document.createElement('div');
            panel.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;'
                + 'flex-direction:column;background:#071a33;color:#e8f0fb;font:13px Arial;';
            panel.innerHTML = ''
                + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
                + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);">'
                + '<div style="min-width:0;">'
                + '<div style="font:700 20px Arial;">' + esc(opts.title) + '</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">' + esc(opts.subtitle) + '</div></div>'
                + '<div style="margin-left:auto;display:flex;gap:10px;">'
                + btn('ug-cancel', 'Cancel', false) + btn('ug-go', opts.go || 'Run', true)
                + '</div></div>'
                + '<div style="flex:1 1 auto;overflow:auto;padding:24px 22px 32px;">'
                + '<div style="width:100%;max-width:720px;margin:0 auto;">' + opts.body + '</div></div>';
            document.body.appendChild(panel);
            // The editor listens on the window for keys and pastes; without this the
            // window-size box would type into the canvas.
            for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
                panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
            }
            return panel;
        };

        const LBL = 'display:block;font:600 12px Arial;color:#9fb3c8;margin:16px 0 4px;';
        const INP = 'box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;'
            + 'border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:9px 11px;font:13px Arial;';
        const NOTE = 'font:12px Arial;color:#9fb3c8;margin-top:6px;';

        // ---- the options panel -----------------------------------------------------------
        const askOptions = (track, defaultSymbol) => new Promise((resolveOpts) => {
            const boxes = SPECIES.map((s) =>
                '<label style="display:inline-flex;align-items:center;gap:6px;margin:0 14px 8px 0;font:13px Arial;">'
                + '<input type="checkbox" class="ug-sp" value="' + s.key + '"' + (s.on ? ' checked' : '') + '/>'
                + esc(s.label) + '</label>').join('');

            const panel = shell({
                title: 'Uniqueness / repeat gradient',
                subtitle: track.name + ' · ' + (track.sequence || '').length + ' nt',
                go: 'Run',
                body: ''
                    + '<label style="' + LBL + '">Window size (nt)</label>'
                    + '<input id="ug-k" type="number" min="3" max="30" step="1" value="20" style="' + INP + 'width:110px;"/>'
                    + '<div style="' + NOTE + '">3 to 30. Below 12 the uniqueness half stops meaning anything: '
                    + 'a reference of R bases holds any k-mer about R/4<sup>k</sup> times by chance, so at k=10 every '
                    + '10-mer is already in a transcriptome a few hundred times. The complexity half still reads '
                    + 'correctly at any size.</div>'

                    + '<label style="' + LBL + '">Species</label>'
                    + '<div>' + boxes + '</div>'
                    + '<div style="' + NOTE + '">Any species whose off-target index this server has not built is '
                    + 'skipped and named in the summary.</div>'

                    + '<label style="' + LBL + '">On-target gene symbol</label>'
                    + '<input id="ug-gene" type="text" placeholder="PMP22" value="' + esc(defaultSymbol || '') + '" style="' + INP + 'width:220px;"/>'
                    + '<div style="' + NOTE + '">Hits in this gene count as on-target rather than off-target. Without '
                    + 'it the transcript\'s own gene is scored as an off-target of itself and the whole track reads '
                    + 'as non-unique.</div>'

                    + '<label style="' + LBL + '">Matching</label>'
                    + '<label style="display:inline-flex;align-items:center;gap:6px;margin-right:18px;">'
                    + '<input type="radio" name="ug-mode" value="exact" checked/> exact</label>'
                    + '<label style="display:inline-flex;align-items:center;gap:6px;">'
                    + '<input type="radio" name="ug-mode" value="editdistance"/> within edit distance '
                    + '<select id="ug-dist" style="' + INP + 'padding:4px 8px;"><option>1</option><option selected>2</option><option>3</option></select>'
                    + '</label>'
                    + '<div style="' + NOTE + '">Exact scores every position and takes about a second per species. '
                    + 'Edit distance is what actually matters for an RNase H oligo, and is far slower, so it is '
                    + 'strided: fewer windows, spaced evenly along the track.</div>'

                    + '<label style="' + LBL + '">Also draw the complexity track</label>'
                    + '<label style="display:inline-flex;align-items:center;gap:6px;">'
                    + '<input id="ug-comp" type="checkbox"/> second layer, so a dip can be read as repeat vs off-target'
                    + '</label>'
            });

            const q = (s) => panel.querySelector(s);
            const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
            panel.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') { close(); resolveOpts(null); }
                else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) q('#ug-go').click();
            });
            q('#ug-cancel').onclick = () => { close(); resolveOpts(null); };
            q('#ug-go').onclick = () => {
                let k = parseInt(q('#ug-k').value, 10);
                if (!(k >= 3 && k <= 30)) { try { q('#ug-k').focus(); } catch (e) { } return; }
                const species = Array.from(panel.querySelectorAll('.ug-sp'))
                    .filter((b) => b.checked).map((b) => b.value);
                if (!species.length) { return; }
                const mode = (panel.querySelector('input[name="ug-mode"]:checked') || {}).value || 'exact';
                close();
                resolveOpts({
                    k: k, species: species, mode: mode,
                    gene: ('' + (q('#ug-gene').value || '')).trim(),
                    dist: parseInt(q('#ug-dist').value, 10) || 2,
                    complexityLayer: !!q('#ug-comp').checked
                });
            };
            try { q('#ug-k').focus(); } catch (e) { }
        });

        // ---- what we scan ----------------------------------------------------------------
        // A highlighted region if the user marked one, otherwise the whole track. The
        // offset is carried so layer x-coordinates land on the right bases either way.
        function scanTarget(track) {
            try {
                const hl = track.getHighlightedSequence && track.getHighlightedSequence();
                if (hl && hl.length > 0) {
                    const sel = (track.selectedRange && track.selectedRange()) || null;
                    return { seq: hl, offset: sel ? (sel.start - track.xi) : 0 };
                }
            } catch (e) { }
            return { seq: track.sequence || '', offset: 0 };
        }

        // A gene symbol to pre-fill: whatever the track already knows itself as.
        function trackSymbol(track) {
            for (const key of ['gene_symbol', 'geneSymbol', 'gene', 'symbol']) {
                try { if (track[key]) return '' + track[key]; } catch (e) { }
            }
            return '';
        }

        function renderSummary(out, grad, track, opts) {
            const sp = out.species || [];
            let warn = '';
            for (const w of (out.warnings || [])) {
                warn += '<div style="margin-bottom:6px;padding:8px 10px;border-radius:6px;'
                    + 'background:rgba(224,112,59,0.12);border:1px solid rgba(224,112,59,0.55);'
                    + 'color:#ffd9c7;font:12.5px Arial;"><b>' + esc(w.scope) + '</b> &mdash; '
                    + esc(w.reason) + '</div>';
            }

            // The regions worth looking at are the low ones, and which term pulled them
            // down. Report the ten worst windows rather than the best: the best are
            // everywhere, the bad ones are the finding.
            const idx = grad.score.map((v, i) => [v === null ? 2 : v, i])
                .sort((a, b) => a[0] - b[0]).slice(0, 10);
            let rows = '';
            for (const [, i] of idx) {
                const comp = grad.complexity[i], uniq = grad.uniqueness[i];
                const cause = (comp !== null && comp < 0.6) ? 'repeat'
                    : ((uniq !== null && uniq < 1) ? 'off-target' : '—');
                let per = sp.map((s) => esc(s) + ':' + (grad.perSpecies[s].off[i])).join(' ');
                rows += '<tr>'
                    + '<td style="padding:3px 8px;">' + grad.position[i] + '–'
                    + (grad.position[i] + out.k - 1) + '</td>'
                    + '<td style="padding:3px 8px;text-align:right;">' + (grad.score[i] === null ? 'n/a' : grad.score[i].toFixed(3)) + '</td>'
                    + '<td style="padding:3px 8px;text-align:right;">' + (comp === null ? 'n/a' : comp.toFixed(3)) + '</td>'
                    + '<td style="padding:3px 8px;text-align:right;">' + (uniq === null ? 'n/a' : uniq.toFixed(3)) + '</td>'
                    + '<td style="padding:3px 8px;">' + cause + '</td>'
                    + '<td style="padding:3px 8px;font:12px monospace;">' + per + '</td>'
                    + '</tr>';
            }

            const html = ''
                + '<div style="padding:10px 12px;">'
                + '<div style="font-weight:700;margin-bottom:6px;">Uniqueness gradient &middot; k='
                + out.k + (out.mode === 'editdistance' ? (' &middot; edit distance ≤ ' + out.editDistance) : ' &middot; exact')
                + '</div>'
                + '<div style="font-size:0.8rem;color:#5b8a86;margin-bottom:8px;">'
                + out.nWindows + ' windows on ' + esc(track.name) + ', stride ' + out.stride
                + (sp.length ? (' &middot; ' + sp.map(esc).join(', ')) : '')
                + (out.geneSymbol ? (' &middot; on-target gene ' + esc(out.geneSymbol))
                    : ' &middot; <b>no gene symbol given</b>, so the transcript\'s own gene counts against it')
                + '</div>'
                + warn
                + '<div style="font-size:0.78rem;color:#5b8a86;margin:10px 0 4px;">Lowest-scoring windows</div>'
                + '<table style="border-collapse:collapse;width:100%;font-size:0.82rem;">'
                + '<thead><tr style="text-align:left;border-bottom:1px solid #bfe4df;">'
                + '<th style="padding:4px 8px;">Window</th><th style="padding:4px 8px;text-align:right;">Score</th>'
                + '<th style="padding:4px 8px;text-align:right;">Complexity</th>'
                + '<th style="padding:4px 8px;text-align:right;">Uniqueness</th>'
                + '<th style="padding:4px 8px;">Pulled down by</th>'
                + '<th style="padding:4px 8px;">Off-targets</th></tr></thead>'
                + '<tbody>' + rows + '</tbody></table></div>';

            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
            CurrentLayout.setComponent('buttonMenuPanel', { wid: 'html', data: html });
        }

        async function addLayers(track, grad, out, opts, offset) {
            const TrackLayer = await exec('baja/bio/track-layer.js');
            const mk = (name, values) => {
                const layer = new TrackLayer(name, track.xi, 0, track.xf, 1);
                // Anchor both ends on the baseline so the filled polygon closes cleanly,
                // the same shape baja/data/conservation-data.js builds for bigwig coverage.
                const x0 = track.xi + offset + (grad.center[0] - 1);
                const xN = track.xi + offset + (grad.center[grad.center.length - 1] - 1);
                layer.addPolygonPoint(x0, 0);
                for (let i = 0; i < values.length; i++) {
                    const v = values[i];
                    layer.addPolygonPoint(track.xi + offset + (grad.center[i] - 1),
                        (v === null || isNaN(v)) ? 0 : v);
                }
                layer.addPolygonPoint(xN, 0);
                layer.sortPolygonPoints();
                return layer;
            };
            track.addLayer(mk('uniqueness k=' + out.k, grad.score));
            if (opts.complexityLayer) track.addLayer(mk('complexity k=' + out.k, grad.complexity));
        }

        async function runGradient(track) {
            const { seq, offset } = scanTarget(track);
            if (!seq || !seq.length) {
                graph.setMessage(' Track ' + track.name + ' has no sequence to scan.');
                return null;
            }
            const opts = await askOptions(track, trackSymbol(track));
            if (!opts) return null;
            if (seq.length < opts.k) {
                graph.setMessage(' Selection (' + seq.length + ' nt) is shorter than the window ('
                    + opts.k + ' nt).');
                return null;
            }

            const em = new EngineMonitor((msg) => { try { log(msg); } catch (e) { } });
            graph.setMessage(' Scoring ' + seq.length + ' nt at k=' + opts.k + ' across '
                + opts.species.length + ' species... ');

            const res = await exec(PY, em, seq, opts.k, opts.species, opts.gene || null,
                null, opts.mode, opts.dist);
            let grad;
            try {
                grad = JSON.parse(res.gradient);
            } catch (e) {
                graph.setMessage(' Failed to parse the gradient for ' + track.name);
                return null;
            }
            await addLayers(track, grad, res, opts, offset);
            renderSummary(res, grad, track, opts);
            graph.setMessage(' Gradient drawn: ' + res.nWindows + ' windows, k=' + res.k
                + (res.species.length ? (' vs ' + res.species.join(', ')) : ''));
            resolve({ result: res, gradient: grad });
            return res;
        }

        if (presetTrack) {
            try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); } catch (e) { }
            const r = await runGradient(presetTrack);
            // runGradient resolves on success; a null is a refusal it has already explained
            // on the canvas, and must not leave the caller hanging.
            if (r == null) resolve(null);
            return;
        }

        // Click-a-track flow, the same shape as baja/data/aso-offtarget.js: hover marks the
        // track under the cursor, a click opens a one-item menu on it.
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.setMouseMode('select-track');
        graph.selectOff();
        graph.setMessage(' Select a transcript track to score... ');

        let selectedTrack = null;
        const menuList = [{
            label: 'Uniqueness / repeat gradient',
            click: async () => {
                const r = await runGradient(selectedTrack);
                if (r == null) resolve(null);
            },
            move: () => { try { log(''); } catch (e) { } }
        }];

        graph.addMouseMoveListener((x, y) => {
            const i = graph.getTrack(x, y);
            if (i >= 0) {
                graph.deselectAllTracks();
                if (graph.track[i]) graph.track[i].showResizeBar = true;
            }
        });

        graph.addMouseDownListener(async (x, y) => {
            const i = graph.getTrack(x, y);
            if (i >= 0) selectedTrack = graph.track[i];
            if (selectedTrack) graph.showMenu(menuList, x, y);
        });
    });
}
