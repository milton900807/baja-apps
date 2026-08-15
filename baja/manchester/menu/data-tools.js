function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let editor_;
        let editor_function = createIonFunction((editor) => {
            editor_ = editor;
        })

        let host_ = window['env']['apiUrl']

        let rslist = await GETJSON(host_ + '/get-nodes?key=bigdata&path=/');
        rs = rslist.values;

        let obj = {}
        let keys = Object.keys(rs);
        for (let key of keys) {

            let r = rs[key]
            let name = r.name;
            let buttonName = name;
            if (!obj[buttonName]) {
                obj[buttonName] = [r]
            } else {
                obj[buttonName].append(r)
            }
        }
        let bigwig = false;
        let items = []
        let rindex = 0;
        for (let key of keys) {
            let r = rs[key].name;
            let index = r.indexOf('.')
            if (index > 0) {
                let buttonName = r.substring(0, index)
                if (r.endsWith('.vcf.gz') || r.endsWith('.vcf')) {
                    r = r.toString().toLowerCase();
                    let function_path = `baja/big-data/vcf/vcf-menu`;
                    let item = {
                        x: rindex, y: 0,
                        label: "VCF", ionFunction: createIonFunction(async () => {
                            graph.setMessage('Select a track ');
                            await exec(`${function_path}`, graph)
                        })
                    }
                    rindex++;
                    items.push(item)
                    break;
                }
                else if (r.endsWith('_RNASEQ.bw')) {
                    bigwig = true;
                }
            }
        }

        let item = {
            x: rindex, y: 0,
            label: "RNASEQ", ionFunction: createIonFunction(async () => {
                graph.setMessage('Select a track ');
                await exec(`baja/bio/cell-lines/bigwig-files-menu2.js`, graph, genegraph_panel_layout)
            })
        }
        rindex++;
        items.push(item)
        let items_length = items.length + 2;
        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 30,
                'width': 700,
                'grid': {
                    xmin: 0,
                    xmax: items_length + 2,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': items
            }
        }

        return resolve(button_canvas)
    })

}
