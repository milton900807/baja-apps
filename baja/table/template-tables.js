function (plateTrack) {

    return new Promise(async (resolve, reject) => {
        const spath = '/baja/templates/tables';
        let host_ = window['env']['apiUrl'];
        let r = await POSTJSON({ spath: spath }, host_ + '/ljl-tree');

        function buildRecursiveNode(node, currentPath = spath) {
            if (node.type === 'directory') {
                const dirPath = `${currentPath}/${node.name}`;
                return {
                    label: '[' + node.name + ']/',
                    children: node.children
                        .map(child => buildRecursiveNode(child, dirPath))
                        .filter(child => child !== null),
                    click: () => { }
                };
            } else if (node.type === 'file' && node.name.endsWith('.ljt')) {
                return {
                    label: node.name.replace('.ljt', ''),
                    click: (loadCallback) => {
                        const parentPath = currentPath;
                        exec('baja/draw/place-table', plateTrack, null, parentPath, node.name, loadCallback);
                    }
                };
            } else {
                return null;
            }
        }

        const list_of_items = r.map(node => buildRecursiveNode(node)).filter(node => node !== null);

        return resolve(list_of_items);

    })

}
