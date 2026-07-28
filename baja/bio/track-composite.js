class CompositeTrack {
    constructor(name, tracks) {
        this.name = name;
        this.tracks = tracks;
    }

    getY(ygraph) {
        return this.tracks.map(track => track.getY(ygraph));
    }

    isSelected() {
        return this.tracks.some(track => track.isSelected());
    }

    setColor(color) {
        this.tracks.forEach(track => track.setColor(color));
    }

    addLayer(t) {
        this.tracks.forEach(track => track.addLayer(t));
    }

    getHighlightedSequence() {
        return this.tracks.map(track => track.getHighlightedSequence());
    }

    getSequenceRange(start, end) {
        return this.tracks.map(track => track.getSequenceRange(start, end));
    }

    getAnnotationsInRange(xstart, xend) {
        return this.tracks.flatMap(track => track.getAnnotationsInRange(xstart, xend));
    }

    getOligosInRange(xstart, xend) {
        return this.tracks.flatMap(track => track.getOligosInRange(xstart, xend));
    }

    getSequences(annotation) {
        return this.tracks.flatMap(track => track.getSequences(annotation));
    }

    findSTOPCodonIndex() {
        return this.tracks.map(track => track.findSTOPCodonIndex());
    }

    generateORF() {
        return this.tracks.map(track => track.generateORF());
    }

    getTranslation() {
        return this.tracks.map(track => track.getTranslation());
    }

    getExons() {
        return this.tracks.flatMap(track => track.getExons());
    }

    getAnnotations(annotation_type) {
        return this.tracks.flatMap(track => track.getAnnotations(annotation_type));
    }

    getCodon(codon_index) {
        return this.tracks.map(track => track.getCodon(codon_index));
    }

    getStartCodonIndex() {
        return this.tracks.map(track => track.getStartCodonIndex());
    }

    copyLayers() {
        return this.tracks.flatMap(track => track.copyLayers());
    }

    getNearestAnnotation(type, x) {
        return this.tracks.map(track => track.getNearestAnnotation(type, x));
    }

    getNextExon(x) {
        return this.tracks.map(track => track.getNextExon(x));
    }

    getNearestAA(x) {
        return this.tracks.map(track => track.getNearestAA(x));
    }

    ORFIndexToGenomicIndex(orfindex) {
        return this.tracks.map(track => track.ORFIndexToGenomicIndex(orfindex));
    }

    getGenomicIndexForCDNAIndex(cdnaIndex) {
        return this.tracks.map(track => track.getGenomicIndexForCDNAIndex(cdnaIndex));
    }

    getGenomicStart() {
        return Math.min(...this.tracks.map(track => track.getGenomicStart()));
    }

    getGenomicEnd() {
        return Math.max(...this.tracks.map(track => track.getGenomicEnd()));
    }

    createTrackFromAnnotation(annotation) {
        return this.tracks.map(track => track.createTrackFromAnnotation(annotation));
    }

    setSequence(sequence) {
        this.tracks.forEach(track => track.setSequence(sequence));
    }

    async addTrackPlot() {
        return Promise.all(this.tracks.map(track => track.addTrackPlot()));
    }

    getSequence() {
        return this.tracks.map(track => track.getSequence());
    }

    getAttributionScore(x, attribution_type) {
        return this.tracks.reduce((sum, track) => sum + track.getAttributionScore(x, attribution_type), 0);
    }

    getStructure(x, y) {
        return this.tracks.flatMap(track => track.getStructure(x, y));
    }

    createSecondaryStructure(xi, s, name, em) {
        return this.tracks.map(track => track.createSecondaryStructure(xi, s, name, em));
    }

    parseMutationSyntax(mutation) {
        return this.tracks.map(track => track.parseMutationSyntax(mutation));
    }

    codingToGenomic(coding) {
        return this.tracks.map(track => track.codingToGenomic(coding));
    }

    genomicToCodingIndex(c) {
        return this.tracks.map(track => track.genomicToCodingIndex(c));
    }

    getGenomicIndexForCDNAIndex(cdnaIndex) {
        return this.tracks.map(track => track.getGenomicIndexForCDNAIndex(cdnaIndex));
    }

    select() {
        this.tracks.forEach(track => track.select());
    }

    deselect() {
        this.tracks.forEach(track => track.deselect());
    }

    removeAnnotation(annotation) {
        this.tracks.forEach(track => track.removeAnnotation(annotation));
    }

    removeStructure(structure) {
        this.tracks.forEach(track => track.removeStructure(structure));
    }

    removeAnnotationByType(type) {
        this.tracks.forEach(track => track.removeAnnotationByType(type));
    }

    setORFColor(mode) {
        this.tracks.forEach(track => track.setORFColor(mode));
    }

    removeOligo(oligo) {
        this.tracks.forEach(track => track.removeOligo(oligo));
    }

    getExonCountVisible() {
        return this.tracks.some(track => track.getExonCountVisible());
    }

    showExonIndicies() {
        this.tracks.forEach(track => track.showExonIndicies());
    }

    hideExonIndicies() {
        this.tracks.forEach(track => track.hideExonIndicies());
    }

    highlight(xi, xf) {
        this.tracks.forEach(track => track.highlight(xi, xf));
    }

    getVisibleOligosXY(start, end, ymin, ymax) {
        let o = [];
        start = +start;
        end = +end;
        for (let track of this.tracks) {
            for (let oligo of track.oligos) {
                if ((oligo.xi >= start && oligo.xf < end) ||
                    (oligo.xf <= end && oligo.xf > start) ||
                    (oligo.xi < end && oligo.xi >= start) ||
                    (oligo.xi < start && oligo.xf > end)) {
                    o.push(oligo);
                }
            }
        }
        let o2 = [];
        for (let oligo of o) {
            let gy = oligo.y;
            if (gy >= ymin && gy < ymax) {
                o2.push(oligo);
            }
        }
        return o2;
    }

    getTrackOligosXY(start, end) {
        let oligos = [];
        start = +start;
        end = +end;
        for (let track of this.tracks) {
            for (let oligo of track.oligos) {
                if ((oligo.xi >= start && oligo.xf < end) ||
                    (oligo.xf <= end && oligo.xf > start) ||
                    (oligo.xi < end && oligo.xi >= start) ||
                    (oligo.xi < start && oligo.xf > end)) {
                    oligos.push({
                        trackName: track.name,
                        oligo: oligo
                    });
                }
            }
        }
        return oligos;
    }
    async draw(graph) {
        await Promise.all(this.tracks.map(track => track.draw(graph)));
    }

    liftLayers() {
        this.tracks.forEach(track => track.liftLayers());
    }

    liftPlots() {
        this.tracks.forEach(track => track.liftPlots());
    }

    liftCompounds() {
        this.tracks.forEach(track => track.liftCompounds());
    }

    gff(g) {
        this.tracks.forEach(track => track.gff(g));
    }

    getAnnotationByName(name) {
        return this.tracks.map(track => track.getAnnotationByName(name)).filter(annotation => annotation != null);
    }

    findNearestAnnotation(targetX, annotationType) {
        return this.tracks.map(track => track.findNearestAnnotation(targetX, annotationType)).filter(annotation => annotation != null);
    }

    getAnnotation(x, y) {
        return this.tracks.flatMap(track => track.getAnnotation(x, y));
    }

    getAnnotationX(x) {
        return this.tracks.flatMap(track => track.getAnnotationX(x));
    }

    getCDS() {
        return this.tracks.map(track => track.getCDS());
    }

    getStopCodonIndex() {
        return this.tracks.map(track => track.getStopCodonIndex());
    }

    createTrackFromAnnotation(annotation) {
        return this.tracks.map(track => track.createTrackFromAnnotation(annotation));
    }

    addTrackPlot() {
        this.tracks.forEach(track => track.addTrackPlot());
    }

    getAllIndexes(arr, val) {
        return this.tracks.map(track => track.getAllIndexes(arr, val)).flat();
    }

    getCodingSequences(t) {
        return this.tracks.map(track => track.getCodingSequences(t)).flat();
    }

    highlightIntron(x) {
        this.tracks.forEach(track => track.highlightIntron(x));
    }

    highlightAnnotation(x) {
        this.tracks.forEach(track => track.highlightAnnotation(x));
    }

    getIntrons(offset) {
        return this.tracks.map(track => track.getIntrons(offset)).flat();
    }

    setTrackCoordinates(start, end) {
        this.tracks.forEach(track => track.setTrackCoordinates(start, end));
    }

    addLayer(t) {
        this.tracks.forEach(track => track.addLayer(t));
    }

    getNextExon(x) {
        return this.tracks.map(track => track.getNextExon(x)).filter(exon => exon != null);
    }

    getNearestAA(x) {
        return this.tracks.map(track => track.getNearestAA(x)).filter(aa => aa != null);
    }

    ORFIndexToGenomicIndex(orfindex) {
        return this.tracks.map(track => track.ORFIndexToGenomicIndex(orfindex)).filter(index => index !== -1);
    }

    createSecondaryStructure(xi, s, name, em) {
        return this.tracks.map(track => track.createSecondaryStructure(xi, s, name, em));
    }

    parseMutationSyntax(mutation) {
        return this.tracks.map(track => track.parseMutationSyntax(mutation));
    }

    removesnp(snpindel) {
        this.tracks.forEach(track => track.removesnp(snpindel));
    }

    addsnpindel(snpindel) {
        this.tracks.forEach(track => track.addsnpindel(snpindel));
    }

    getStructure(x, y) {
        return this.tracks.flatMap(track => track.getStructure(x, y));
    }
}

return CompositeTrack;
