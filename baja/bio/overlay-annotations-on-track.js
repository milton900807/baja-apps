function (graph, alignment_file, x, y) {

    return new Promise(async (resolve, reject) => {

        const { Track, TrackRef } = await exec('baja/bio/track.js')
        let Oligo = await exec('flexigraph/oligo.js');

        alignment_file = alignment_file.trim()
        alignment_file = alignment_file.replaceAll('\r', ' ')
        let sp = alignment_file.split(/\r?\n/)
        let res = {}
        let start_index = 0;
        let end_index = 1;
        let alt_index = 2;
        let ref_index = 3;

        let first_line = sp[0]
        let trv = first_line.split(/\s+/)
        let index = 0;
        for (let t of trv) {
            if (t.toUpperCase().startsWith('START')) {
                start_index = index;
            } else if (t.toUpperCase().startsWith('STOP')) {
                end_index = index;
            } else if (t.toUpperCase().startsWith('ALT')) {
                alt_index = index;
            } else if (t.toUpperCase().startsWith('REF')) {
                ref_index = index;
            }
            index++;
        }

        let o = []
        for (let line of sp) {
            line = line.trim()
            let trv = line.split(/\s+/g)
            let start = trv[start_index]
            let end = trv[end_index]
            let ref = trv[ref_index]
            let alt = trv[alt_index]

            if (ref.toUpperCase() === 'REF') {

            } else {
                log(start + ' ' + end + ' ' + ref + ' ' + alt)
                let oligo = new Oligo('allele', '' + ref + '/' + alt, start, end, 0.1);
                o.push(oligo)
            }

        }
        showWidget({
            wid: 'json',
            data: JSON.stringify(o)
        })

        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            let track = graph.track[trackIndex]
            console.log('debubg');
            for (let oligo of o) {
                track.addOligo(oligo);
            }
            resolve(track);
        }
    })
}
