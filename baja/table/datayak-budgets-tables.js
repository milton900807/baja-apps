function (pm) {

    return new Promise(async (resolve, reject) => {
        const spath = '/baja/templates/ptxproject';
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
                    click: () => {
                        const parentPath = currentPath;
                        exec('baja/draw/place-table', pm.plateTrack, null, parentPath, node.name);
                    }
                };
            } else {
                return null;
            }
        }

        const list_of_items = r.map(node => buildRecursiveNode(node)).filter(node => node !== null);

        const t = [
            {
                label: '[Fixed] columns table',
                click: () => { },
                children: [
                    {
                        label: 'General',
                        click: async () => {

                            await exec('baja/draw/draw-table', pm.plateTrack);
                        }
                    },

                ]
            },
            {
                label: '[Flexible] columns table',
                click: () => { },
                children: [
                    {
                        label: 'General flex',
                        click: async () => {
                            await exec('baja/draw/draw-table', pm.plateTrack, 'transparent');
                        }
                    },

                ]
            },
            {
                label: 'more...',
                description: ' Specialized models',
                click: () => { },
                children: list_of_items
            }
        ];

        return resolve(t);

    })

}
