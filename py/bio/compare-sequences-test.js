function () {

    let s1 = "FQTWEEFSRAAEKLYLADPMKVRVVLKYRHVDGNLCIKVTDDLVCLVYRTDQAQDVKKIEKF"
    let s2 = "FQTWEEFSRAAEKLYLAAFADFMKVRVVLKYRHVDGNLCIKVTDDLVCLVYRTDQAQDVKKIEKF"

    exec('py/bio/compare-sequences.py',  s1, s2).then(r => {
        showWidget({
            wid: 'json',
            data: JSON.stringify(r)
        })
    })

}
