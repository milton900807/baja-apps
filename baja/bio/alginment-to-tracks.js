function (alignment_file, x, y) {

    return new Promise(async (resolve, reject) => {

        const { Track, TrackRef } = await exec('baja/bio/track.js')
        alignment_file = alignment_file.replaceAll('\r', ' ')
        let sp = alignment_file.split(/\r?\n/)

        let res = {}
        let a = []
        let b = []
        let c = []

        let index = 0;
        for (let line of sp) {
            if (line.startsWith('CLUSTAL')) {
            } else {
                if (line.trim().length <= 0) {
                    index = 0
                }
                let tab_index = line.split(/\s+/)
                if (tab_index && tab_index[0].trim().length > 0) {
                    if (!res[tab_index[0]])
                        res[tab_index[0]] = ''
                    res[tab_index[0]] += tab_index[1]
                }
            }
        }

        let tracks = []
        let keys = Object.keys(res);
        let prev = null;
        for (let k of keys) {
            let a = res[k]
            let track = new Track(k, 0, a.length, y)
            track.sequence = a;
            tracks.push(track)
            if (prev != null) {
                let trackRef = new TrackRef(prev, prev.xi, prev.xf);
                trackRef.showMismatches = true;
                track.trackRef = trackRef
            }
            prev = track;
        }

        resolve(tracks);
    })
}
