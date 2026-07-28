function (jso) {

    return new Promise(async (resolve, reject) => {

        let type = jso.type;
        if (type != null) {
            let importobject = await exec('flexigraph/shapes/' + type + '.js')
            let object = Object.assign(new importobject(), jso);
            resolve(object);
        }else {
            resolve ( null )
        }

    })

}
