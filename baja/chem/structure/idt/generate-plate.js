function(structureList) {
    return new Promise(async (resolve, reject) => {
        let idt = await exec('/baja/chem/structure/id/idt-format.js');
        let l = []
        for (let structure of structureList) {
            let idtValue = idt.format(idt)
            log(idtValue);
            l.push(idtValue)
        }
        resolve(l);
    })

}
