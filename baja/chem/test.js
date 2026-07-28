function () {
    exec('baja/chem/biopolymer.js').then(Biopolymer => {
        let syntx = `([?]moe.p.[?]cet.p){5}([?]d.p.){10}([?]moe.p.){4}([?]moe){1}`
        let ls = Biopolymer.countBasesOligoScript(syntx)
        log(ls)

        let syntx2 = `r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()p.r()`
        ls = Biopolymer.countBases(syntx2)
        log(ls)

    })

}
