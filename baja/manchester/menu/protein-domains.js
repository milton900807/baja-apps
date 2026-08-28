function (graph, genegraph_panel_layout) {
    // Protein Domains: prompt the user to SELECT A TRACK, then derive the ORF/CDS of that
    // track, run a CDD domain search on the translated protein, and draw the protein-domain
    // graphic (ProteinDomain + functional-site AA annotations) mapped back onto the track's
    // genomic coordinates. If the selected track has no ORF/protein (not protein coding), tell
    // the user it is not a protein coding transcript.
    return (async () => {
        const Annotation = await exec('flexigraph/annotation.js');

        const reArmHover = () => {
            try { graph.clearMouseListeners(); } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };

        // Map CDD protein domains onto one track's protein sequence.
        const runDomains = async (t) => {
            if (!t) { graph.setMessage(' No track selected. '); return; }

            // Build the ORF and the exon-aware CDS translation. cds.codonPos[i] is the genomic
            // coordinate of residue i+1's codon (0-based), used to place the domain annotations.
            try {
                for (let as of (t.annotations || [])) { if (as.type === 'NMD') t.removeAnnotation(as); }
                t.generateORF();
            } catch (e) { }
            let cds = null;
            try { cds = t.getCDS(); } catch (e) { }
            const proteinSeq = ('' + ((cds && cds.protein) || '')).toString();

            // No ORF/protein -> this track is not a protein coding transcript.
            if (!cds || !cds.codonPos || proteinSeq.length < 3) {
                graph.setMessage(' ' + (t.name || 'This track') + ' is not a protein coding transcript. ');
                return;
            }

            graph.setMessage(' Finding protein domains (CDD) for ' + (t.name || 'the track') + '… ');

            // 1-based residue -> genomic coordinate of that residue's codon.
            const getNucleotideIndex = (aa) => (aa >= 1 && aa <= cds.codonPos.length) ? cds.codonPos[aa - 1] : -1;

            const parseDomains = (index, output) => {
                let domains = [];
                for (let i = index; i < output.length; i++) {
                    const line = output[i];
                    if (line.startsWith('ENDDOMAINS')) return domains;
                    const tline = line.split('\t');
                    domains.push({ type: tline[2], start: tline[4], end: tline[5], evalue: tline[6], id: tline[8], name: tline[9] });
                }
                return domains;
            };
            const parseSites = (index, output) => {
                let sites = [];
                for (let i = index; i < output.length; i++) {
                    const line = output[i];
                    if (line.startsWith('ENDSITES')) return sites;
                    const tline = line.split('\t');
                    sites.push({ name: tline[3], sites: tline[4] });
                }
                return sites;
            };

            let nDomains = 0, nSites = 0;
            const drawResult = (value) => {
                if (!value || !value['file'] || value['file'].length < 1) return;
                const output = ('' + value['file']).split('\n');
                let domains = [], sites = [];
                for (let idx = 0; idx < output.length; idx++) {
                    if (output[idx].startsWith('DOMAIN')) domains = parseDomains(idx + 1, output);
                    if (output[idx].startsWith('SITES')) sites = parseSites(idx + 1, output);
                }
                for (let d of domains) {
                    const istart = getNucleotideIndex(+d.start);
                    const iend = getNucleotideIndex(+d.end);
                    if (istart < 0 || iend < 0) continue;
                    // codonPos runs 3'->5' on the minus strand, so order the span.
                    const alo = Math.min(istart, iend);
                    const ahi = Math.max(istart, iend) + 2;   // include the last codon
                    const an = new Annotation('ProteinDomain', d.name, alo, ahi);
                    an.labelY = Math.random() + 2;
                    t.add(an);
                    nDomains++;
                }
                for (let s of sites) {
                    const name = s.name;
                    const list = s.sites;
                    if (!list || list.length < 1) continue;
                    const positions = (list.indexOf(',') > 0) ? list.split(',') : [list];
                    for (let p of positions) {
                        const aa = +('' + p).substring(1).trim();
                        const start = getNucleotideIndex(aa);
                        if (start >= 0) {
                            const an = new Annotation('AA', name, start - 2, start + 1);
                            an.labelY = Math.random() + 1;
                            t.add(an);
                            nSites++;
                        }
                    }
                }
            };

            // Chunk the protein (CDD handles big inputs) and search each chunk.
            const chunkSize = 10000000;
            let chunks = [];
            for (let i = 0; i < proteinSeq.length; i += chunkSize) chunks.push(proteinSeq.substring(i, i + chunkSize));
            for (let chunk of chunks) {
                try {
                    // NCBI CD-Search (hosted) — no local BLAST/CDD install required.
                    const result = await exec('py/cdd/cdsearch.py', chunk);
                    if (result && result['file'] != null) drawResult(result);
                } catch (e) { console.warn('protein-domains: CDD chunk failed', e); }
            }

            try { if (t.fitYAxis) t.fitYAxis(); } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }

            if (nDomains === 0 && nSites === 0) {
                // Coding transcript, but CDD found nothing to map.
                graph.setMessage(' No protein domains found for ' + (t.name || 'this track') + '. ');
            } else {
                graph.setMessage(' Added ' + nDomains + ' protein domain(s)' + (nSites ? ' and ' + nSites + ' functional site(s)' : '') + ' to ' + (t.name || 'the track') + '. ');
            }
        };

        if (!graph.track || graph.track.length === 0) {
            graph.setMessage(' Load a track first, then choose Protein Domains. ');
            return;
        }

        // Cursor prompt: click a track, then map its protein domains onto its sequence.
        graph.setMessage(' Select a track to map its protein domains… ');
        try { graph.clearMouseListeners(); } catch (e) { }
        try { graph.setMouseMode('msg: Click a track to map its protein domains.'); } catch (e) { }
        graph.addMouseDownListener(async (x, y) => {
            const ti = graph.getTrack(x, y);
            if (ti < 0) return;
            const t = graph.track[ti];
            try { graph.clearMouseListeners(); } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { await runDomains(t); } catch (e) { graph.setMessage(' Protein domain lookup failed: ' + (e && e.message ? e.message : e)); }
            reArmHover();
        });
    })();
}
