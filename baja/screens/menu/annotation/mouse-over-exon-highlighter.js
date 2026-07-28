function (graph, genegraph_panel_layout, selectedTrack, mode) {

    function findNearestSites(dna, position, strand) {
        function findAcceptorLeft(dna, position) {
            for (let i = position; i >= 0; i--) {
                if (dna.slice(i, i + 2) === 'AG') {
                    return i;
                }
            }
            return null;
        }

        function findDonorRight(dna, position) {
            for (let i = position; i < dna.length - 1; i++) {
                if (dna.slice(i, i + 2) === 'GT') {
                    return i;
                }
            }
            return null;
        }

        function findAcceptorRight(dna, position) {
            for (let i = position; i < dna.length - 1; i++) {
                if (dna.slice(i, i + 2) === 'CT') {
                    return i;
                }
            }
            return null;
        }

        function findDonorLeft(dna, position) {
            for (let i = position; i >= 0; i--) {
                if (dna.slice(i, i + 2) === 'AC') {
                    return i;
                }
            }
            return null;
        }

        let acceptorSite, donorSite;

        if (strand >= 0) {
            acceptorSite = findAcceptorLeft(dna, position);
            donorSite = findDonorRight(dna, position);
        } else if (strand < 0) {
            acceptorSite = findAcceptorRight(dna, position);
            donorSite = findDonorLeft(dna, position);
        } else {
            throw new Error("Strand must be 'forward' or 'reverse'");
        }

        return {
            acceptorSite: acceptorSite,
            donorSite: donorSite
        };
    }

    graph.addMouseDownListener(async (x, y) => {
    })
    graph.addMouseMoveListener((x, y) => {

        let wgx = Math.floor(selectedTrack.tgraph.Xwc(x) - selectedTrack.tgraph.xi * 2);
        let gx = wgx - selectedTrack.tgraph.xmin;
        let nx = findNearestSites(selectedTrack.sequence, gx, selectedTrack.strand);
        let don = nx.donorSite;

        let a = selectedTrack.getNearestAnnotation("Exon", wgx);
        if (mode === 'donor' && selectedTrack.strand >= 0) {
            selectedTrack.markstart = a.xi + (a.xf - a.xi)/2;
            selectedTrack.markend = selectedTrack.tgraph.xmin + don;
        } else {
            selectedTrack.markend = selectedTrack.tgraph.xmin + don;
        }

    });
}
