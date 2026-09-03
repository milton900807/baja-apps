function (track, bedPath, chr, start, end, strand) {

    // Apply a BED file's intervals, within [start, end) on `chr`, onto `track` as a
    // TrackLayer. Lifted verbatim from baja/data/my-data.js's 'Bed' track-first flow (click
    // a track, then pick a file) -- pulled out so manchester/fb.js's file-first flow (click
    // a .bed.gz directly in the general file browser) gets the exact same conversion.
    //   const count = await exec('baja/data/apply-bed-to-track.js', track, path, chr, start, end, strand);
    // Resolves the number of intervals added (0 on any failure -- logged, not thrown).

    return new Promise(async (resolve) => {
        try {
            const TrackLayer = await exec('baja/bio/track-layer.js');
            const em = new EngineMonitor((msg) => { log(msg); });

            function makeBedLabel(bed) {
                let name = bed.name || bed.id || 'BED interval';
                let ann = bed.annotations || {};
                let score = ann.score ? ` score=${ann.score}` : '';
                let info = ann.thickStart ? ` ${ann.thickStart}` : '';
                return `${name}${score}${info}`;
            }
            function getBedIntervalColor(bed) {
                let ann = bed.annotations || {};
                let info = String(ann.thickStart || '').toUpperCase();
                if (info.includes('INDEL')) {
                    return 'rgba(230, 120, 20, 0.45)';
                }
                if (info.includes('SNP')) {
                    return 'rgba(30, 90, 220, 0.45)';
                }
                if (bed.strand === '-1') {
                    return 'rgba(160, 60, 180, 0.45)';
                }
                return 'rgba(30, 160, 80, 0.45)';
            }

            const res = await exec('py/bio/lj-bed-file-loader.py', em, bedPath, chr, start, end, strand);
            const bedRows = Array.isArray(res) ? res : res?.results;
            if (!Array.isArray(bedRows)) {
                console.error('BED loader returned no results array for', bedPath);
                resolve(0);
                return;
            }

            let rs_base = bedPath.split('/').pop();
            rs_base = rs_base.replace(/\.bed\.gz$/i, '').replace(/\.bed$/i, '');
            let layer = new TrackLayer(rs_base, track.xi, 0, track.xf, 1);
            layer.data_type = 'BED';
            layer.type = 'TrackLayer';
            layer.drawStyle = 'interval';
            layer.color = 'rgba(30, 90, 220, 0.35)';
            layer.fillstyle = 'rgba(30, 90, 220, 0.35)';
            layer.setLabelFont('10px Arial');

            let count = 0;
            for (let bed of bedRows) {
                let x1 = Number(bed.xi);
                let width = Math.max(Number(bed.xf || 1), 1);
                let x2 = x1 + width;
                if (!Number.isFinite(x1) || !Number.isFinite(x2)) {
                    continue;
                }
                if (x2 < start || x1 > end) {
                    continue;
                }
                let label = makeBedLabel(bed);
                let y = layer.getYByOverlapCount(x1, x2);

                count++;

                layer.addInterval(x1, x2, y, label);
                let color = getBedIntervalColor(bed);
                layer.setIntervalColor(x1, x2, y, label, color);
            }
            track.addLayer(layer);

            resolve(count);
        } catch (e) {
            console.error('apply-bed-to-track failed:', e);
            resolve(0);
        }
    });
}
