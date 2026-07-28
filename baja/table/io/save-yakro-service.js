function (track, _name) {

    return new Promise(async (resolve, reject) => {

        let name = generateNautName();
        if (_name && _name.length > 0) {
            name = _name;
        }
        let currentPath = '/.temp'
        let gs = JSON.stringify(track, function (key, value) {
            if (key != null) {
                if (key === 'fun') {
                    if (value != null)
                        return value.toString();
                }
                if (key.toString().toLowerCase() === 'toplate' && value) {
                    return 'toPlate:' + value[key].uid
                }
                if (key.toString().toLowerCase() === 'fromplate' && value) {
                    return 'fromPlate:' + value[key].uid
                }
                if (key.startsWith('__')) {
                    return null;
                }
                return value;
            }

            return value;
        });

        if (!name.endsWith('.bjb')) {
            name = name + '.bjb'
        }
        let binaryData = compressString(gs)
        const chunkSize = 0x8000;
        let stringData = '';
        for (let i = 0; i < binaryData.length; i += chunkSize) {
            const chunk = binaryData.subarray(i, i + chunkSize);
            stringData += String.fromCharCode.apply(null, chunk);
        }
        currentPath = currentPath.replace('//', '/')
        let host_ = window['env']['apiUrl']
        let jsonobj = {
            "name": name,
            "key": "user",
            "user": getUser(),
            "spath": currentPath,
            "value": stringData
        }
        let rs = await POSTJSON(jsonobj, host_ + '/save-user-data');
        if (rs['path'].indexOf('myfiles') >= 0 && rs['path'].indexOf(getUser()) >= 0) {
            rs['path'] = rs['path'].replace('/' + getUser(), '')
        }
        currentPath = rs['path']
        currentPath = currentPath.replace('//', '/')

        function replaceFirstNode(path, withf) {

            const startsWithSlash = path.startsWith('/');
            if (!startsWithSlash) {
                path = '/' + path;
            }

            const parts = path.split('/');

            for (let i = 1; i < parts.length; i++) {
                if (parts[i].length > 0) {
                    parts[i] = withf;
                    break;
                }
            }

            const newPath = parts.join('/');

            return startsWithSlash ? newPath : newPath.substring(1);
        }

        if (rs.status === "saved") {
            let returned = await GETJSON(host_ + '/validate-file?path=/' + rs['path'] + "&key=user&user=" + getUser());

            resolve({
                path: currentPath,
                user: getUser(),
                name: name
            })
        }
    })

}
