function (selectedTrack, phaseselect) {

    let variants = [];
    for ( let sid of selectedTrack.snpindels ) {
        if ( sid.phase == phaseselect ) {
            variants.push ( sid );
        }
    }

    let splicedtrack = selectedTrack.sequence;
    let splicedindices = Array(selectedTrack.sequence.length).fill(selectedTrack.xi).map((x_,y_) => x_ + y_ );

    if ( variants.length > 0 ) {
        for (let sid of variants) {
            splicedtrack = splicedtrack.slice(0,splicedindices.indexOf(sid.xi))
                            + sid.alternate0
                            +splicedtrack.slice(splicedindices.indexOf(sid.xf));
            splicedindices = splicedindices.slice(0,splicedindices.indexOf(sid.xi)).concat(
                            Array(sid.alternate0.length).fill(sid.xi),
                            splicedindices.slice(splicedindices.indexOf(sid.xf))
            );
        }
    }
    return [splicedtrack,splicedindices]
}
