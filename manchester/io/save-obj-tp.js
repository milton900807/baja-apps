function (graph, main_layout, path, reference_object) {
    return new Promise(async (resolve, reject) => {
        function getLastFolderFromPath(filePath) {
            const normalizedPath = filePath.replace(/\\/g, '/');
            const segments = normalizedPath.split('/');
            segments.pop();
            const lastFolder = segments.pop();
            return lastFolder;
        }
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
        function removeMyFilesNode(currentPath) {

            if (currentPath.startsWith("/myfiles")) {

                return currentPath.slice("/myfiles".length);
            } else if (currentPath.startsWith("myfiles")) {

                return currentPath.slice("myfiles".length);
            }

            return currentPath;
        }
        let dv = '';
        if (graph.file) {
            dv = graph.file;
        }
        path = removeMyFilesNode(path);
        let currentPath = path;
        if (!currentPath || currentPath.trim() < 0) {
            currentPath = '/'
        }
        currentPath = currentPath.trim();
        if (currentPath.startsWith('/myfiles')) {
            currentPath = currentPath.replace('/myfiles', '')
        }
        currentPath = getLastFolderFromPath(path);
        if (currentPath === 'myfiles') {
            currentPath = ''
        }
        let init_path = '/' + getUser();
        if (init_path.endsWith('/')) {
            init_path = init_path.substring(0, init_path.length - 1)
        }
        let name = graph.file;
        if (!name) {
            return;
        }
        if (!currentPath) {
            currentPath = '/'
        }
        let gs = JSON.stringify(graph, function (key, value) {
            if (key != null && key.toLowerCase().startsWith('_')) {
                return null;
            }
            else
                if (typeof value === 'object' && value !== null) {
                    if (Array.isArray(value) && value.every(elem => elem && typeof elem === 'object' && 'x' in elem && 'y' in elem)) {
                        return value;
                    } else if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) {
                        return value;
                    }
                    else {
                        return value;
                    }
                }
            return value;
        });
        if (!name.endsWith('.bjb')) {
            name = name + '.bjb'
        }
        gs.owner = getUser();
        if (gs.track === null) {
            alert(' no track ')
            return;
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
        if (rs.status === "saved") {
            let returned = await GETJSON(host_ + '/validate-file?path=/' + rs['path'] + "&key=user&user=" + getUser());
            let tcount = 0;
            let ocount = 0;
            let snpsc = 0;
            let tracks = returned.track;
            tcount = tracks.length;
            for (let t of tracks) {
                if (t.oligos) {
                    ocount += t.oligos.length;
                }
                if (t.snpindels)
                    snpsc += t.snpindels.length;

            }
            graph.setMessage("Saved", 9)

        }
    })
}
