function (server, graph, genegraph_panel_layout, text) {
    // PASTED VCF: load the transcripts its variants sit in, and put the variants on them.
    //
    // A VCF is a machine format with exact coordinates, so none of this is guesswork.
    // py/bio/vcf-paste.py parses the records as written and reads each variant's gene off
    // GENCODE by position -- the same tabix-indexed annotation the rest of the server uses --
    // then names the MANE Select transcript for each gene. The variant's gene is a fact about
    // where it sits, and the file is not asked what it thinks its own genes are: an ANN= or
    // CSQ= field carries whatever build the annotator ran, and a VCF that has crossed
    // assemblies is exactly where the two disagree.
    //
    // The transcripts are then loaded and the records placed on them through the same
    // variantWorldX mapping the ClinVar loader uses, with the INFO column handed to
    // setAnnotation -- so a ClinVar-derived VCF arrives with its significance, its condition
    // and its consequence, and draws the same callouts as anything else on the board.
    const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
    const restoreHover = () => { try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { } };

    return (async () => {
        let r = null;
        try {
            const em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
            say('Reading the pasted VCF…');
            r = await exec(server + '/py/bio/vcf-paste.py', em, ('' + (text || '')), 'human');
        } catch (e) { r = null; }

        let genes = [];
        try { genes = JSON.parse((r && r.genes) || '[]'); } catch (e) { genes = []; }
        if (!r || r.error || !genes.length) {
            say('The pasted VCF could not be used'
                + ((r && r.error) ? ': ' + r.error : ((r && r.unplaced) ? ': none of its variants fall in a gene' : ''))
                + '.');
            return false;
        }

        // ---- what was found -----------------------------------------------------------------
        const panel = document.createElement('div');
        try { const old = document.getElementById('baja-vcf-paste'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        panel.id = 'baja-vcf-paste';
        panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
            + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
        const placed = genes.reduce((n, g) => n + g.variants.length, 0);
        const row = (g, i) =>
            '<label style="display:flex;align-items:flex-start;gap:10px;padding:11px 12px;margin-bottom:8px;'
            + 'border-radius:8px;background:#0a1e3a;border:1px solid rgba(255,255,255,0.16);cursor:pointer;">'
            + '<input type="checkbox" class="vp-g" data-i="' + i + '" checked style="margin-top:3px;"/>'
            + '<span style="min-width:0;">'
            + '<span style="font:700 13.5px Arial;color:#e8f0fb;">' + esc(g.gene) + '</span>'
            + '<span style="font:13px Arial;color:#9fb3c8;"> · ' + esc(g.transcript || 'no transcript found') + '</span>'
            + '<br/><span style="font:12px Arial;color:#9fb3c8;">'
            + g.variants.length + ' variant' + (g.variants.length === 1 ? '' : 's')
            + ' · chr' + esc(g.chr) + ' · ' + (g.strand === '-' ? 'minus' : 'plus') + ' strand</span>'
            + '</span></label>';
        panel.innerHTML = ''
            + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
            + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);box-shadow:0 6px 20px rgba(0,0,0,0.35);">'
            + '<div style="min-width:0;"><div style="font:700 20px Arial;">Pasted VCF</div>'
            + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">'
            + r.count + ' record' + (+r.count === 1 ? '' : 's') + ' read · ' + placed + ' in '
            + genes.length + ' gene' + (genes.length === 1 ? '' : 's')
            + (r.note ? ' · ' + esc(r.note) : '') + '</div></div>'
            + '<div style="margin-left:auto;display:flex;gap:10px;">'
            + '<button id="vp-cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;'
            + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Cancel</button>'
            + '<button id="vp-go" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 12.5px Arial;'
            + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;">Load</button>'
            + '</div></div>'
            + '<div style="flex:1 1 auto;overflow:auto;padding:24px 22px 32px;">'
            + '<div style="width:100%;max-width:720px;margin:0 auto;">'
            + '<label style="display:block;font:600 12px Arial;color:#9fb3c8;margin:0 0 6px;">Genes to load</label>'
            + genes.map(row).join('')
            + '<div style="font:12px Arial;color:#9fb3c8;margin-top:16px;">'
            + 'One transcript is loaded per gene and its variants are placed on it. '
            + 'Nothing already on the board is touched.</div>'
            + '</div></div>';
        document.body.appendChild(panel);
        for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
            panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
        }
        const pick = await new Promise((resolve) => {
            const q = (s) => panel.querySelector(s);
            const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
            panel.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') { close(); resolve(null); }
                else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) q('#vp-go').click();
            });
            q('#vp-cancel').onclick = () => { close(); resolve(null); };
            q('#vp-go').onclick = () => {
                const chosen = Array.prototype.slice.call(panel.querySelectorAll('.vp-g'))
                    .filter((c) => c.checked).map((c) => genes[+c.getAttribute('data-i')])
                    .filter((g) => g && g.transcript);
                if (!chosen.length) { say('Tick a gene with a transcript to load.'); return; }
                close(); resolve(chosen);
            };
        });
        if (!pick) { restoreHover(); return false; }

        let SnpIndel = null;
        try { SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { }
        if (!SnpIndel) { say('Variant support unavailable.'); restoreHover(); return false; }

        const sigOf = (info) => {
            const m = ('' + (info || '')).match(/(?:^|;)CLNSIG=([^;]*)/);
            return m ? m[1].replace(/_/g, ' ').replace(/[|/]/g, ',') : '';
        };
        const colorFor = (sig) => {
            const t = ('' + sig).toLowerCase();
            if (!t) return null;
            if (t.indexOf('conflict') >= 0) return '#94a3b8';
            if (t.indexOf('pathogenic') >= 0) return '#c0392b';
            if (t.indexOf('benign') >= 0) return '#22c55e';
            return '#94a3b8';
        };

        let loadedTracks = 0, added = 0, unmapped = 0;
        for (let i = 0; i < pick.length; i++) {
            const g = pick[i];
            say('Loading ' + g.gene + ' (' + g.transcript + ') — ' + (i + 1) + ' of ' + pick.length + '…');
            const before = new Set((graph.track || []));
            try { await exec('baja/data/prompt-load-transcript.js', server, graph, genegraph_panel_layout, g.transcript); }
            catch (e) { continue; }
            const fresh = (graph.track || []).filter((t) => t && !before.has(t));
            if (!fresh.length) continue;
            loadedTracks += fresh.length;
            try { graph.pushOntoHistory(); } catch (e) { }
            for (const track of fresh) {
                for (const v of g.variants) {
                    // The SAME mapping the ClinVar loader uses. A track knows where its own
                    // genomic coordinates land; working it out here from xi would be a second
                    // implementation of that, and a second place for it to be wrong.
                    const wx = track.variantWorldX ? track.variantWorldX(g.chr, v.pos) : null;
                    if (wx == null) { unmapped++; continue; }
                    const ref = ('' + v.ref).toUpperCase(), alt = ('' + v.alt).toUpperCase();
                    let type = 'snp';
                    if (alt.length > ref.length) type = 'ins';
                    else if (ref.length > alt.length) type = 'del';
                    // Deletions are anchored one base past the record's position on the plus
                    // strand -- VCF quotes the base before the deleted run.
                    let placeXi = wx;
                    if (type === 'del' && track.strand !== -1) placeXi = wx + 1;
                    const sig = sigOf(v.info);
                    const label = v.id || (g.gene + ' ' + v.pos);
                    try {
                        const snp = new SnpIndel(type, placeXi, ref, alt, 0, track.strand,
                            label, null, colorFor(sig));
                        snp.name = label;
                        snp.source = 'VCF';
                        // The INFO column, through the class's own parser: a ClinVar-derived
                        // VCF then carries its significance, its condition and its consequence
                        // into the detail box and the callout like anything else.
                        const annots = ('' + (v.info || '')).split(';').filter(Boolean);
                        if (annots.length) { try { snp.setAnnotation(annots); } catch (e) { } }
                        if (sig) snp.clinsig = sig;
                        if (v.qual) snp.quality = 'QUAL=' + v.qual;
                        track.addsnpindel(snp);
                        track.showSnpIndels = true;
                        added++;
                    } catch (e) { }
                }
            }
        }
        try { if (graph.wake) graph.wake(); } catch (e) { }
        say('Loaded ' + loadedTracks + ' transcript' + (loadedTracks === 1 ? '' : 's')
            + ' and placed ' + added + ' variant' + (added === 1 ? '' : 's') + ' from the pasted VCF'
            + (unmapped ? ' (' + unmapped + ' fell outside the transcripts loaded)' : '') + '.');
        restoreHover();
        return added > 0;
    })();
}
