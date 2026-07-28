function (nmid) {

    return new Promise(async (rer, rec) => {

        let gener = await GETJSON(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?dbfrom=nuccore&db=gene&id=${nmid}&format=json`);
        let linksets = gener.linksets;

        let linksetdbs = linksets[0]['linksetdbs']
        let gene_id = null;
        for (let t of linksetdbs) {
            if (t['dbto'] === 'gene') {
                let links = t['links']
                if (links > 0) {
                    gene_id = links[0]
                }
            }
        }

        if (gene_id) {
            let summary = await GETJSON(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=${gene_id}&rettype=gene_table&format=json`)
            let fr = await exec('baja/ncbi/efetch.py', 'gene', gene_id);
            let s = null;
            if (summary) {
                s = summary['result'][gene_id]
                let ginfo = s['genomicinfo']
                let chrom = ginfo['chrloc']
                let start = ginfo['chrstart']
                let end = ginfo['chrstop']

                let geneObj = {

                }
                geneObj['sequence'] = fr['sequence']
                geneObj['start'] = start;
                geneObj['end'] = end
                geneObj['chrom'] = chrom
                let exons = fr['annotation']['structure']['exons']
                let coding = fr['annotation']['structure']['coding']

                let Exonlist = []
                let index = 1;
                for (let ex of exons) {
                    let ste = +ex.split('-')[0]
                    let stf = +ex.split('-')[1]
                    Exonlist.push({
                        'object_type': 'Exon',
                        'id': index++,
                        'start': ste,
                        'end': stf
                    })
                }

                let CDSlist = []
                index = 1;
                for (let ex of coding) {
                    let ste = +ex.split('-')[0]
                    let stf = +ex.split('-')[1]
                    CDSlist.push({
                        'object_type': 'CDS',
                        'id': index++,
                        'start': ste,
                        'end': stf
                    })
                }
                let js = {

                }
                js['object_type'] = "Transcript"
                js['Exon'] = Exonlist
                js['CDS'] = CDSlist

                showWidget({
                    wid: 'json',
                    data: JSON.stringify(js)
                })

            }
        } else {
            log(' no gene id found ')
            showWidget({
                wid: 'json',
                data: JSON.stringify(gener)
            })
        }

    })
}
