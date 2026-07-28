function () {

    let ht = window['env']['apiUrl'] + '/load-host-dictionary?path=/data/cddid.tbl&name=cdd&header=id,mid,cddid,desc,index'
    GETJSON(ht).then(r => {
        showWidget({
            wid: 'json',
            data: JSON.stringify(r)
        })
    })

}
