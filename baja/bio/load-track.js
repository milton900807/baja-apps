function (js) {

    return new Promise(async (resolve, reject) => {
        let Amplicon = await exec('flexigraph/amplicon.js')
        let Oligo = await exec('flexigraph/oligo.js')
        let SIRNA = await exec('flexigraph/sirna.js')
        let SnpIndel = await exec('flexigraph/snpindel.js')
        let MutationAnnotation = await exec('flexigraph/mutation-annotation.js')
        let MGrid = await exec('flexigraph/grid.js')
        let shapes = await exec('flexigraph/gene-draw.js')
        let Annotation = await exec('flexigraph/annotation.js')
        let { Track, TrackRef } = await exec('baja/bio/track.js')
        let TrackLayer = await exec('baja/bio/track-layer.js')
        let RNASecondaryStructure = await exec('baja/structure/rna-secondary-structure-track.js')
        let TrackPlot = await exec('flexigraph/track-plot.js')

        console.log('debubg');

        let foo = Object.assign(new Track(), js);
        if (js.sequence != null && js.sequence.length > 0) {
            foo.sequence = js.sequence;
        }
        if (js.track_layers != null && js.track_layers.length > 0) {
            let tlayers = []
            for (let tl of js.track_layers) {
                let track_layer = Object.assign(new TrackLayer(), tl)
                track_layer.svgs = []
                if (tl.svgs && tl.svgs.length > 0) {
                    for (let tli of tl.svgs) {
                        track_layer.svgs.push(tli)
                    }
                }

                let tann = []
                if (tl.annotations && tl.annotations.length > 0) {
                    for (let __a of tl.annotations) {
                        __a.shapeFunction = getIon(shapes[__a.type])
                        tann.push(Object.assign(new Annotation(), __a))
                    }

                }
                track_layer.annotations = tann;

                track_layer.tgraph = Object.assign(new MGrid(), tl.tgraph)
                tlayers.push(track_layer)
            }
            foo.track_layers = tlayers;
        }

        let annn = []
        if (js.annotations && js.annotations.length > 0) {
            for (let a of js.annotations) {
                a.shapeFunction = getIon(shapes[a.type])
                annn.push(Object.assign(new Annotation(), a))
            }
        }

        let o = []
        if (js.oligos && js.oligos.length > 0 && js.oligos[0]) {
            for (let a of js.oligos) {
                if (a != null) {

                    if (a.type === 'amplicon') {
                        let leftOligo = Object.assign(new Oligo(), a['left'])
                        let rightOligo = Object.assign(new Oligo(), a['right'])
                        let midOligo = Object.assign(new Oligo(), a['mid'])
                        let ampliconObject = Object.assign(new Amplicon(), a)
                        ampliconObject.left = leftOligo;
                        ampliconObject.mid = midOligo;
                        ampliconObject.right = rightOligo;
                        o.push(ampliconObject)
                    } else
                        if (a.type === 'siRNA') {
                            o.push(Object.assign(new SIRNA(), a))
                        } else
                            o.push(Object.assign(new Oligo(), a))
                }
            }
        }

        let sids = [];
        if (js.snpindels && js.snpindels.length > 0 && js.snpindels[0]) {
            for (let sid of js.snpindels) {
                if (sid.type === 'mutation-annotation') {
                    sids.push(new MutationAnnotation(sid.type, sid.xi, sid.xf, sid.name, sid.phase, sid.transcriptStrand, sid.id))
                } else
                    sids.push(new SnpIndel(sid.type, sid.xi, sid.reference, sid.alternate, sid.phase, sid.transcriptStrand, sid.id))
            }
        }

        let struct = [];
        if (js.structures && js.structures.length > 0 && js.structures[0]) {
            for (let strc of js.structures) {
                let rna = new RNASecondaryStructure(strc.name, strc.xi, strc.xf, strc.sequence, strc.strand);
                rna.pos = strc.pos;
                rna.tgraph.xi = strc.tgraph.xi;
                rna.tgraph.yi = strc.tgraph.yi;
                rna.anchorX = strc.anchorX;
                rna.anchorY = strc.anchorY;
                rna.tgraph.yi = strc.tgraph.yi;
                if (strc.designs)
                    rna.designs = strc.designs;

                let temp_grid = Object.assign(new MGrid(), strc.tgraph);
                rna.tgraph = temp_grid;
                struct.push(rna);
            }
        }

        let plots = []

        if (js.plots && js.plots.length > 0 && js.plots[0]) {
            for (let a of js.plots) {
                let tp = Object.assign(new TrackPlot(), a)

                if (a.mg != null) {
                    let amg = Object.assign(new MGrid(), a.mg);
                    tp.mg = amg;
                    plots.push(tp)
                }
            }
        }
        let temp_grid = Object.assign(new MGrid(), js.tgraph);
        foo.tgraph = temp_grid;
        foo.oligos = o;
        foo.snpindels = sids;
        foo.annotations = annn;
        foo.plots = plots;
        foo.structures = struct;
        if (js.trackRef && js.trackRef.track && js.trackRef.track.name) {
        }
        resolve(foo);
    });
}
