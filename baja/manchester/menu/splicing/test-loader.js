function (datapath, server, graph, genegraph_panel_layout) {

    let filename = 'ENST00000366815'

    let rootPath = '/bd/' + datapath
    exec('py/bio/splice/load-splicing-data.py', rootPath, filename).then(async r => {
        let AttributionLayer = await exec('baja/bio/attribution-layer.js');
        let js = decompressString(r['results'])
        let obj = JSON.parse(js);
        let attr_window = 720;
        let transcriptID = obj['transcript']['canonical_transcript'].split('.')[0]
        let strack = await graph.add(filename)
        let grobj = obj['acceptor_attr']
        let index = 0;
        console.log(" we have the scores ")
        for (let ob of grobj) {
            if (index % 2 === 0) {
                let scores = ob['scores']
                let site = ob['site']
                let attribution_scores = scores['log_odds_ratios']
                let attribution_indices = scores['out_indices']
                let layer = new AttributionLayer(strack.xi + site + '', strack.xi, 0, strack.xf, 1,
                    'acceptor_attribution', strack.xi + site, attr_window, strack);
                let max_exp = Math.max(...attribution_scores.map((s) => Math.floor(s)))
                if (!max_exp) {
                    max_exp = 1.
                }
                max_exp = max_exp * -2;

                let aindex = 0;
                for (let ivalue of attribution_indices) {
                    let score = attribution_scores[aindex++]
                    if (ivalue >= 0 && ivalue < strack.sequence.length) {
                        let base = strack.sequence[ivalue];

                        layer.addAttributionPoint(strack.xf - ivalue, score / max_exp, base);
                    }
                }
                console.log(" adding thelayer ")
                strack.addLayer(layer);
            }
            index++;
        }
    })
}
