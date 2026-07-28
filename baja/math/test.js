function () {

    exec('baja/math/le-distance.js').then( le => {
        let value = le('ACTACATAG', 'ACTCCATAG')
        log(value)
    })
}
