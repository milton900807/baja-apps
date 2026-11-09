async function (graph, L, tracks, range, asoLen) {
    // BajaASOWalk: tile an oligo footprint along an exon's flanks and draw where
    // blocking the RNA would strengthen the exon's donor.
    //
    // The exon comes from the track's own annotations: whichever exon is
    // selected, or failing that the one nearest the centre of the view. The walk
    // needs an exon because the question is "which positions help THIS exon",
    // and a footprint is only interpretable relative to a boundary.
    const TrackLayer = await exec('baja/bio/track-layer.js');
    const track = (tracks && tracks.length) ? tracks[0] : null;
    if (!track) { graph.setMessage(' Select a track first. '); return false; }

    const seq = track.sequence || '';
    if (!seq) { graph.setMessage(' That track has no sequence. '); return false; }

    const exons = (track.annotations || []).filter(
        (a) => a && ('' + a.type).toLowerCase() === 'exon');
    if (!exons.length) { graph.setMessage(' That track has no exon annotations. '); return false; }

    let exon = exons.find((a) => a.isSelected && a.isSelected());
    if (!exon) {
        const mid = (track.tgraph.xmin + track.tgraph.xmax) / 2;
        let best = null;
        for (const a of exons) {
            const d = Math.abs(((+a.xi) + (+a.xf)) / 2 - mid);
            if (best === null || d < best.d) best = { a: a, d: d };
        }
        exon = best.a;
    }
    const ex0 = Math.min(+exon.xi, +exon.xf), ex1 = Math.max(+exon.xi, +exon.xf);
    const strand = (track.strand < 0) ? '-1' : '1';
    // On the minus strand the exon's DONOR side is its lower track x.
    const donorX = (strand === '-1') ? ex0 : ex1;
    const LEN = asoLen || 18;

    graph.setMessage(' Walking an oligo along exon ' + ex0 + '-' + ex1 + '… ');
    const em = new EngineMonitor((msg) => { graph.setMessage(' ' + msg + ' '); });
    em.addProgressListener(async (v) => { graph.setMessage(' ' + v + '% '); });

    const res = await exec(window['env']['apiUrl'] + '/py/bio/splice/aso-walk.py',
        em, seq, track.tgraph.xmin, strand, donorX, LEN, -40, 300, 'plus');
    if (res && res.error) { graph.setMessage(' ' + res.error + ' '); return false; }

    let walk = [];
    try { walk = JSON.parse((res && res.walk) || '[]'); } catch (e) { walk = []; }
    if (!walk.length) { graph.setMessage(' The walk returned nothing. '); return false; }

    // Only footprints clear of the splice-site consensus are candidates. The
    // ones over it score high for the wrong reason: masking a weak donor's own
    // context raises the model's score, while an oligo there would block the
    // donor and cause skipping.
    const cand = walk.filter((w) => !w[3]);
    if (!cand.length) { graph.setMessage(' Every footprint overlapped the splice site. '); return false; }
    const sorted = cand.map((w) => +w[1]).sort((a, b) => a - b);
    const p90 = sorted[Math.floor(0.9 * (sorted.length - 1))];
    const top = cand.slice().sort((a, b) => (+b[1]) - (+a[1])).slice(0, 25);

    const name = 'BajaASOWalk';
    const layer = new TrackLayer((track.name || 'track') + '_' + name,
        track.tgraph.xmin, 0, track.tgraph.xmax, 1);
    layer.data_type = name;
    layer.verticalLabels = true;
    layer.color = 'rgba(32,150,110,0.65)';
    layer.fillstyle = layer.color;
    let added = 0;
    for (const w of top) {
        const g = +w[1];
        if (!(g > p90)) continue;                 // only what stands out from the walk
        const a = Math.max(0.25, Math.min(0.95, g / 6));
        const s = +w[0], e = s + LEN - 1;
        layer.addInterval(Math.min(s, e), Math.max(s, e), Math.min(1, g / 6),
            '+' + g.toFixed(1), 'rgba(32,150,110,' + a.toFixed(2) + ')');
        added++;
    }
    if (!added) {
        graph.setMessage(' No footprint stood out from the walk on that exon. ');
        return false;
    }
    track.addLayer(layer);
    if (layer.setTimedHighlight) layer.setTimedHighlight(10000);
    setTimeout(() => { try { if (graph.wake) graph.wake(); } catch (e) { } }, 10100);
    if (graph.wake) graph.wake();
    graph.setMessage(' ' + added + ' candidate oligo position'
        + (added === 1 ? '' : 's') + ' on exon ' + ex0 + '-' + ex1
        + '. Labels are the gain in donor strength, in logits. ');
    return true;
}
