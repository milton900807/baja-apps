function (graph, filelist) {

    return new Promise(async (resolve, reject) => {
        if (!filelist) {
            let host_ = window['env']['apiUrl']
            let rslist = await GETJSON(host_ + '/get-nodes?key=bigdata&path=/');
            rs = rslist.values;
            filelist = rs;

        }

        filelist = filelist.filter(item => {
            return item.name.toLowerCase().endsWith('.vcf');
        });

        let menuList = []
        let editor;
        r = createIonFunction((p) => {
            editor = p;
        })

        graph.clearMouseListeners();
        graph.selectOff();
        let selectedTrack = null;

        for (let f of filelist) {
            menuList.push(
                {
                    label: f.name,
                    click: async (scx, scy) => {
                        let chr = selectedTrack.chr;
                        let start = selectedTrack.xi;
                        let end = selectedTrack.xf;
                        let em = new EngineMonitor((v) => {
                        })
                        let r = await exec(host_ + `/py/bio/lj-tabix-2.py`, '/bd' + f.path + '.gz', 'chr' + chr, start, end, selectedTrack.strand);
                        showModal({
                            wid: 'json',
                            data: JSON.stringify(r)
                        })

                        let SnpIndel = await exec('flexigraph/snpindel.js')
                        let count = 0;
                        if (r != null && r['results'] != null) {
                            for (let sid of r['results']) {
                                let snp = new SnpIndel(sid.type, sid.xi, sid.reference, sid.alternate, sid.phase, selectedTrack.strand, sid.id)
                                snp.name = sid.name;
                                selectedTrack.addsnpindel(snp)
                                count++;
                            }
                        }
                        graph.setMessage(' click ')
                    },
                    move: () => {
                    }
                });

        }

        graph.addMouseMoveListener((x, y) => {
            if (!graph.menuVisible()) {

                let trackIndex = graph.getTrack(x, y);
                if (trackIndex >= 0) {
                    let cselectedTrack = graph.track[trackIndex]
                    if (cselectedTrack && selectedTrack != cselectedTrack) {
                        if (selectedTrack)
                            selectedTrack.showResizeBar = false;
                    }
                    selectedTrack = cselectedTrack;
                    if (selectedTrack)
                        selectedTrack.showResizeBar = true;
                } else {
                    graph.selectOff();
                    selectedTrack = null;
                }
            }
        })

        graph.addMouseDownListener((x, y) => {
            if (graph.menuVisible()) {
                return;
            }

            if (selectedTrack) {
                graph.showMenu(menuList, x, y, 200)
            }

        })
        graph.addMouseUpListener((x, y) => {

        })
        resolve()
    })
}
