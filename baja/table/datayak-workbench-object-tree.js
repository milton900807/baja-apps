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
                    click: () => {
                        const parentPath = currentPath;
                        exec('baja/draw/place-table', plateTrack, null, parentPath, node.name);
                    }
                };
            } else {
                return null;
            }
        }

        const list_of_items = r.map(node => buildRecursiveNode(node)).filter(node => node !== null);

        const t = [
            {
                label: '[Fixed] columns tables',
                click: () => { },
                children: [
                    {
                        label: 'General',
                        click: async () => {
                            await exec('baja/draw/draw-table', plateTrack);
                        }
                    },

                ]
            },
            {
                label: '[Flexible] columns tables',
                click: () => { },
                children: [
                    {
                        label: 'General flex',
                        click: async () => {
                            await exec('baja/draw/draw-table', plateTrack, 'transparent');
                        }
                    },

                ]
            },
            {
                label: 'more...',
                description: ' Specialized tables...',
                click: () => { },
                children: list_of_items
            }
        ];

        return resolve(t);

    })

}
