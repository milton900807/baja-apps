function (graph, track, name, endpoint, filepath) {

    let chr = track.chr;
    let start = track.xi;
    let end = track.xf;
    let em = new EngineMonitor((v) => {

    })
    exec(`${endpoint}/ionworks/py/bio/lj-tabix.py`, filepath, chr, start, end, track.strand).then(async (r) => {

        let SnpIndel = await exec('flexigraph/snpindel.js')

        let count = 0;
        if (r != null && r['results'] != null) {

            for (let sid of r['results']) {

                let snp = new SnpIndel(sid.type, sid.xi, sid.reference, sid.alternate, sid.phase, track.strand, sid.id)
                snp.name = sid.name;

                track.addsnpindel(snp)
                count++;
            }
        }

        graph.setMessage(' Added ' + count + ' snps.')
    }

    )

}
