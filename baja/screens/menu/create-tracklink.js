function (track) {

    return Promise(async (resolve, reject) => {

        let Annotation = await exec('flexigraph/annotation.js')
        let { Track, TrackRef } = await exec('baja/bio/track.js')
        let RectangleText = await exec('flexigraph/shapes/Rect-text.js')

        let trackRef_ = new TrackRef(this, this.xi, this.xf);
        trackRef_.map = seqindex;
        trackRef_.genomeMap = genomeIndex;
        track.trackRef = trackRef_;
        selectedTrack.trackRef.showMismatches = !selectedTrack.trackRef.showMismatches
    })

}
