function (__plate) {
    return new Promise(async (resolve, reject) => {
        const load_file = async (path, name) => {
            let jsonobj = {
                'spath': path,
                'rule_name': name,
                'user': getUser(),
                'type': 'ljt'
            };
            let host_ = window['env']['apiUrl'];
            let rs = await POSTJSON(jsonobj, host_ + '/get-script');
            return rs;
        };
        const spath = '/baja/templates';
        let host_ = window['env']['apiUrl'];
        let r = await POSTJSON({ spath: spath }, host_ + '/ljl-tree');

        function buildNode(node) {
            if (node.type === 'directory') {
                return {
                    label: node.name,
                    children: node.children
                        .map(buildNode)
                        .filter(child => child !== null),
                    click: () => { }
                };
            } else if (node.type === 'file' && node.name.endsWith('.ljt')) {
                return {
                    label: node.name.replace('.ljt', ''),
                    click: async () => {
                        const dir = node.path.split('/').slice(0, -1).join('/').replace(/\\/g, '/');
                        const file = node.name;
                        const val = await load_file(spath + dir, file);
                        let pt = __decompress(val.rule_value);
                        let Plate = await exec('baja/plate/plate');
                        let plate_ = Plate.buildPlateFromJSON(pt);
                        for (const key of Object.keys(plate_)) {
                            if (key.startsWith('attr__')) {
                                __plate[key] = plate_[key];
                            }
                        }
                        let rows = plate_.wells.length;
                        let cols = plate_.wells[0].length;

                        let lastWellPerColumn = new Array(cols).fill(null);

                        for (let col = 0; col < cols; col++) {
                            for (let row = 0; row < rows; row++) {
                                let w = (plate_.wells && plate_.wells[col] && plate_.wells[col][row]) ? plate_.wells[col][row] : null;
                                if (w) {
                                    lastWellPerColumn[col] = w;
                                }
                                if (col < __plate.wells.length && row < __plate.wells[0].length) {
                                    let targetWell = __plate.wells[col][row];
                                    if (w && targetWell) {
                                        targetWell.properties = w.properties;
                                        targetWell.equations = w.equations;
                                        targetWell.group = w.group;
                                        targetWell.setWellType(w.skin_type);
                                    }
                                }
                            }
                        }
                        for (let col = 0; col < cols; col++) {
                            for (let row = rows; row < __plate.wells[0].length; row++) {
                                if (col < __plate.wells.length) {
                                    let targetWell = __plate.wells[col][row];
                                    let lastw = lastWellPerColumn[col];
                                    if (lastw && targetWell) {
                                        targetWell.properties = lastw.properties;
                                        targetWell.equations = lastw.equations;
                                        targetWell.group = lastw.group;
                                        targetWell.setWellType(lastw.skin_type);
                                    }
                                }
                            }
                        }

                    }
                };
            } else {
                return null;
            }
        }

        const t = r.map(buildNode).filter(node => node !== null);
        resolve(t);
    });

}
