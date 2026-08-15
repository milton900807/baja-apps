function (datapath, server, graph, genegraph_panel_layout) {
    return new Promise(async (resolve, reject) => {
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.setMouseMode('select-track');
        graph.selectOff();
        graph.setMessage(" Select a track that carries the ASO oligos... ");

        // Max edit distance treated as an off-target hit (adjust to taste).
        const OFFTARGET_MAX_DIST = 2;
        const PY = server + '/py/sequence/aso-levenshtein-offtarget.py';

        let selectedTrack = null;
        let menuList = [];

        // Pull the ASO sequences (and names) off a track's oligos.
        function collectAsos(track) {
            let names = [];
            let seqs = [];
            let oligos = (track && track.oligos) ? track.oligos : [];
            for (let o of oligos) {
                let seq = o.seq || o.sequence;
                if (seq && ('' + seq).length > 0) {
                    seqs.push('' + seq);
                    names.push(o.name || o.id || ('ASO_' + (seqs.length)));
                }
            }
            return { names, seqs };
        }

        // The sequence we scan the ASOs against: the highlighted region if the
        // user marked one, otherwise the whole track sequence.
        function referenceSequence(track) {
            try {
                let hl = track.getHighlightedSequence && track.getHighlightedSequence();
                if (hl && hl.length > 0) return hl;
            } catch (e) { }
            return track.sequence || '';
        }

        function esc(s) {
            return ('' + s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function renderResults(payload, track) {
            let results = [];
            try { results = JSON.parse(payload.results); } catch (e) { results = []; }

            let rows = '';
            for (let r of results) {
                let sites = (r.offTargets || []).slice(0, 8).map(h =>
                    `<span style="white-space:nowrap;">${esc(h.orientation)}@${h.start} `
                    + `(d=${h.distance})</span>`).join(', ');
                if (!sites) sites = '<i>none</i>';
                rows += `<tr>
                    <td style="padding:4px 8px;font-weight:600;">${esc(r.aso)}</td>
                    <td style="padding:4px 8px;font-family:monospace;">${esc(r.seq)}</td>
                    <td style="padding:4px 8px;text-align:center;">${r.hitCount}</td>
                    <td style="padding:4px 8px;">${sites}</td>
                </tr>`;
            }

            let html = `
                <div style="padding:10px 12px;">
                  <div style="font-weight:700;margin-bottom:6px;">
                    ASO off-target (Levenshtein &le; ${payload.threshold})
                  </div>
                  <div style="font-size:0.8rem;color:#5b8a86;margin-bottom:8px;">
                    ${payload.asoCount} ASOs scanned against ${payload.sequenceLength} nt
                    on ${esc(track.name)}
                  </div>
                  <table style="border-collapse:collapse;width:100%;font-size:0.82rem;">
                    <thead>
                      <tr style="text-align:left;border-bottom:1px solid #bfe4df;">
                        <th style="padding:4px 8px;">ASO</th>
                        <th style="padding:4px 8px;">Sequence</th>
                        <th style="padding:4px 8px;">Hits</th>
                        <th style="padding:4px 8px;">Off-target sites</th>
                      </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                  </table>
                </div>`;

            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
            CurrentLayout.setComponent('buttonMenuPanel', { wid: 'html', data: html });
        }

        let runOffTarget = async (track) => {
            let { names, seqs } = collectAsos(track);
            if (!seqs.length) {
                graph.setMessage(" No ASO oligos found on " + track.name);
                return null;
            }

            let reference = referenceSequence(track);
            if (!reference || !reference.length) {
                graph.setMessage(" Track " + track.name + " has no sequence to scan.");
                return null;
            }

            let em = new EngineMonitor((msg) => { log(msg); });
            graph.setMessage(" Running Levenshtein off-target on " + seqs.length + " ASOs... ");

            // Native arrays -> the python side receives them as lists.
            let res = await exec(PY, em, seqs, reference, OFFTARGET_MAX_DIST, names);

            try {
                renderResults(res, track);
                let results = JSON.parse(res.results);
                graph.setMessage(" Off-target scan complete (" + results.length + " ASOs).");
                resolve(results);
                return results;
            } catch (exception) {
                graph.setMessage(" Failed to parse off-target results for " + track.name);
                return null;
            }
        };

        menuList.push({
            label: 'ASO off-target (Levenshtein)',
            click: async (xwc, ywc) => {
                await runOffTarget(selectedTrack);
            },
            move: () => { log(''); }
        });

        graph.addMouseMoveListener((x, y) => {
            let p_trackIndex = graph.getTrack(x, y);
            if (p_trackIndex >= 0) {
                graph.deselectAllTracks();
                if (graph.track[p_trackIndex])
                    graph.track[p_trackIndex].showResizeBar = true;
            }
        });

        graph.addMouseDownListener(async (x, y) => {
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex];
            }
            if (selectedTrack) {
                graph.showMenu(menuList, x, y);
            }
        });
    });
}
