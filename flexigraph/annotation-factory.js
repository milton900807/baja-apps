function () {
    return new Promise(async (resolve, reject) => {
        let Annotation = await exec('flexigraph/annotation.js')
        let NMDAnnotation = await exec('baja/bio/splicing/nmd-annotation.js')
        let shapes = await exec('flexigraph/gene-draw.js')

        class AnnotationFactory {
            static generate(__a) {
                if (__a.type === 'NMD') {
                    __a.shapeFunction = getIon(shapes[__a.type])
                    return Object.assign(new NMDAnnotation(), __a)
                } else {
                    __a.shapeFunction = getIon(shapes[__a.type])
                    return (Object.assign(new Annotation(), __a))
                }
            }
        }
        return resolve(AnnotationFactory);
    });
}
