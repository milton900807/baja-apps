function () {
    return new Promise(async (resolve, reject) => {
        class Formula {
            wells = []
            constructor() {
            }
            async update() {
                for (let d of this.wells) {
                    let v = await exec('baja/plate/ops/frun-object.js', activeContent.trim(), plateTrack);
                    let r = v['results']
                    let t = v['group']
                    for (let io of r) {
                        let i = io.value;

                    }
                }
            }
        }
        return resolve(Formula)
    })
}
