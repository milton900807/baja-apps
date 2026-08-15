function (graph, library, file) {
    graph.setMessage(" Click on track to view menu options...")
    let sharepoint_config = {
        'scope': ['User.Read', 'Files.Read',
            'GroupMember.Read.All',
            'Files.ReadWrite', 'Files.ReadWrite.All',
            'Sites.Read.All', 'Sites.ReadWrite.All', 'Sites.ReadWrite.All']
    }
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.addMouseDownListener(async (x, y) => {
        let html_panel;
        let currentPath;
        let selectedTrack = null;
        let selectedtrackIndex = graph.getTrack(x, y);
        if (selectedtrackIndex != null && selectedtrackIndex >= 0) {
            selectedTrack = graph.track[selectedtrackIndex]
        } else {
            graph.setMessage(" Please click on a track")
            return;
        }
        graph.showMenu([
            {
                'label': 'Add  vcf file to track', click: async () => {
                    let selectedFile = null;
                    let opItem = {
                        wid: 'card',
                        data: {
                            height: '600px',
                            cards: [
                                [

                                    {
                                        'title': ' ', 'body': ``
                                        ,
                                        'width': '90%',
                                        'component':
                                        {
                                            wid: 'folder-browser',
                                            width: 1000,
                                            data: {
                                                width: 800,
                                                path: `/drives/${library.id}/root:/bajabio-screens`,
                                                "ionfunction.folderadded": createIonFunction(async (folder) => {

                                                    alert(' Cannot add a folder using this dialog box ')
                                                }),
                                                "ionfunction.fileClick": createIonFunction(async (library, path_, file) => {
                                                    let l = library;
                                                    if (library.startsWith('/'))
                                                        l = library.substring(1)
                                                    let sharepoint_config = {
                                                        'scope': ['User.Read', 'Files.Read',
                                                            'GroupMember.Read.All',
                                                            'Files.ReadWrite', 'Files.ReadWrite.All',
                                                            'Sites.Read.All', 'Sites.ReadWrite.All', 'Sites.ReadWrite.All']
                                                    }
                                                    let path = `/drives/${l}/items/${file.id}`
                                                    let MSGraph = await exec('lib/msgraph.js');
                                                    let client = await MSGraph.getClient(sharepoint_config);
                                                    let ff = await client.api(path).get();
                                                    selectedFile = ff;
                                                    if (html_panel)
                                                        html_panel.setHTML('<hr><h4 font="red">Selected file is ' + ff.name + "</h4> File size: " + ff.size);

                                                    if (ff.size === 0) {
                                                        console.log(" File size is 0.. this could be syncing on the cloud")

                                                    }

                                                }),
                                                "ionfunction.path": createIonFunction(async (path, nodes) => {
                                                    currentPath = path;
                                                    if (!path.isFolder) {
                                                        if (path.name.toLowerCase().endsWith('.vcf')) {
                                                        }
                                                    }
                                                })
                                            }
                                        }
                                    },
                                    {
                                        'title': ' ', 'body': ``
                                        ,
                                        'width': '90%',
                                        'component':
                                        {
                                            wid: 'html',
                                            refCallback: createIonFunction((panel) => {
                                                html_panel = panel;
                                            }),
                                            data: ' Select a vcf file above.  <font color=red> If the file is large try installing it on the VCF server first. </font>'
                                        }
                                    },
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'mt-button', data: {
                                                buttons: [
                                                    {
                                                        label: 'Install', ionFunction: createIonFunction(() => {
                                                            hideAllModal();
                                                        })
                                                    },
                                                    {
                                                        label: 'Load', ionFunction: createIonFunction(() => {
                                                            hideAllModal();
                                                        })
                                                    },
                                                    {
                                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                                            hideAllModal();
                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    }
                                ]]
                        }
                    }
                    showModal(opItem)
                }
            },
            {
                'label': 'Add genomic (xlsx)', click: async () => {
                    let selectedFile = null;
                    let l = library.id;
                    let opItem = {
                        wid: 'card',
                        data: {
                            height: '600px',
                            cards: [
                                [
                                    {
                                        'title': ' ', 'body': ``
                                        ,
                                        'width': '90%',
                                        'component':
                                        {
                                            wid: 'folder-browser',
                                            width: 1000,
                                            data: {
                                                width: 800,
                                                path: `/drives/${library.id}/items/${file.id}`,
                                                "ionfunction.folderadded": createIonFunction(async (folder) => {

                                                    alert(' Cannot add a folder using this dialog box ')
                                                }),
                                                "ionfunction.fileClick": createIonFunction(async (library, path_, file) => {

                                                    let path = `/drives/${l}/items/${file.id}`
                                                    let MSGraph = await exec('lib/msgraph.js');
                                                    let client = await MSGraph.getClient(sharepoint_config);
                                                    let ff = await client.api(path).get();
                                                    selectedFile = ff;
                                                    if (html_panel)
                                                        html_panel.setHTML('<hr><h4 font="red">Selected file is ' +
                                                            ff.name + "</h4> File size: " + ff.size);

                                                    if (ff.size === 0) {
                                                        console.log(" File size is 0.. this could be syncing on the cloud")
                                                    }

                                                }),
                                                "ionfunction.path": createIonFunction(async (path, nodes) => {
                                                    currentPath = path;
                                                    if (!path.isFolder) {
                                                        if (path.name.toLowerCase().endsWith('.vcf')) {
                                                        }
                                                    }
                                                })
                                            }
                                        }
                                    },
                                    {
                                        'title': ' ', 'body': ``
                                        ,
                                        'width': '90%',
                                        'component':
                                        {
                                            wid: 'html',
                                            refCallback: createIonFunction((panel) => {
                                                html_panel = panel;
                                            }),
                                            data: ` Select an excel file above.
                                            <font color=red> If the file is large try
                                            installing it on the VCF server first. </font>`
                                        }
                                    },
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'mt-button', data: {
                                                buttons: [
                                                    {
                                                        label: 'Load', ionFunction: createIonFunction(async () => {
                                                            let Annotation = await exec('flexigraph/annotation.js')

                                                            let MSGraph = await exec('lib/msgraph.js');
                                                            let client = await MSGraph.getClient(sharepoint_config);

                                                            let objectid = selectedFile['id']
                                                            let sheet_path = `/drives/${library.id}/items/${objectid}/workbook/worksheets/coordinates`;
                                                            let sheetObject = await client.api(sheet_path).get();
                                                            let sheet_id = sheetObject['id']
                                                            let workbookWorksheet = await client.api(`/drives/${library.id}/items/${objectid}/workbook/worksheets/${sheet_id}/range(address='A1:F10000')`).get();

                                                            let text = workbookWorksheet.text;
                                                            let coords = []
                                                            for (let iteml of text) {
                                                                let chr = iteml[0].trim()
                                                                let start = iteml[1].trim()
                                                                let end = iteml[2].trim()
                                                                let strand = iteml[3].trim()
                                                                let name = iteml[4].trim()
                                                                let desc = iteml[5].trim()
                                                                coords.push({
                                                                    'chr': chr,
                                                                    'start': +start,
                                                                    'end': +end,
                                                                    'strand': strand,
                                                                    'type': name,
                                                                    'name': desc
                                                                })
                                                            }

                                                            let tr = graph.track;
                                                            for (let t of tr) {
                                                                for (let c of coords) {
                                                                    if (c.start > t.tgraph.xmin && c.end <= t.tgraph.xmax) {

                                                                        let annotation = new Annotation(c.type, c.name, c.start, c.end, c.strand);
                                                                        annotation.y = 1 + Math.random()
                                                                        t.add(annotation)

                                                                    }
                                                                }
                                                            }

                                                            showModal({
                                                                wid: 'json',
                                                                data: JSON.stringify(coords)
                                                            })

                                                            hideAllModal();
                                                        })
                                                    },
                                                    {
                                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                                            hideAllModal();
                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    }
                                ]]
                        }
                    }
                    showModal(opItem)
                }
            },

            {
                'label': 'Sequence variant', click: async () => {
                    let mutation_parser = await exec('baja/bio/sequence-variant-parser.js')
                    let selectedFile = null;
                    let panel;

                    function convertMRNAtoPreMRNA(mrnaIndex, intronPositions) {

                        intronPositions.sort((a, b) => a - b);

                        let preMRNAIndex = mrnaIndex;

                        for (let i = 0; i < intronPositions.length; i++) {
                            const intronStart = intronPositions[i];

                            if (mrnaIndex >= intronStart) {
                                preMRNAIndex--;
                            }
                        }

                        return preMRNAIndex;
                    }

                    let getIntronPositions = () => {

                        let sorted_annotations = selectedTrack.annotations;
                        sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
                        for (let a of sorted_annotations) {
                            if (a.type === "Translation") {
                                annotation = a;
                            }
                        }
                        if (!annotation)
                            throw ("The Translation (annotation type == Translation) annotation is not defined. ")

                        if (selectedTrack.strand >= 0) {
                            sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
                            let totalCount = 0;
                            for (let a of sorted_annotations) {
                                if (a.type === "Exon") {

                                }

                                let genomicToCodingIndex = (c) => {
                                    let annotation = null;
                                    let sorted_annotations = selectedTrack.annotations;
                                    sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
                                    for (let a of sorted_annotations) {
                                        if (a.type === "Translation") {
                                            annotation = a;
                                        }
                                    }
                                    if (!annotation)
                                        throw ("The Translation (annotation type == Translation) annotation is not defined. ")

                                    if (selectedTrack.strand >= 0) {
                                        sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
                                        let totalCount = 0;
                                        for (let a of sorted_annotations) {
                                            if (a.type === "Exon") {

                                                if (a.xi <= annotation.xi && a.xf > annotation.xi) {
                                                    let increment = Math.floor(a.xf) - Math.floor(annotation.xi)
                                                    totalCount += increment;
                                                    console.log(' start codon difference ' + totalCount)
                                                    if (totalCount >= c) {
                                                        return Math.floor(annotation.xi) + (c) - 1;
                                                    }
                                                } else
                                                    if (a.xi <= annotation.xf && a.xf > annotation.xf) {

                                                        let exonCount = Math.floor(annotation.xf) - Math.floor(a.xi);
                                                        let lo = c - totalCount;
                                                        return Math.floor(a.xi) + lo - 1;
                                                    } else
                                                        if (a.xi > annotation.xi && a.xf < annotation.xf) {
                                                            totalCount += Math.floor(a.xf - a.xi)
                                                        }

                                                if (totalCount >= c) {
                                                    return Math.floor(a.xf) - (totalCount - c) - 1;
                                                }
                                            }
                                        }
                                    } else {

                                        sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });
                                        let totalCount = 0;
                                        let baseCount = Math.abs(annotation.xf - annotation.xi);
                                        let indexb = annotation.xi;
                                        for (let a of sorted_annotations) {
                                            if (a.type === "Exon") {

                                                if (a.xf > annotation.xi && a.xi < annotation.xi) {
                                                    let increment = Math.abs(annotation.xi - a.xi);
                                                    totalCount += increment;
                                                }

                                                else {
                                                    let increment = Math.abs(a.xf - a.xi)

                                                    totalCount += increment + 1;

                                                }
                                            }

                                            if ((totalCount) >= c) {

                                                return a.xi + ((totalCount - c));

                                            }
                                        }
                                        return indexb + (c - totalCount);

                                    }
                                }
                                let nameHook = createIonFunction((inputt) => {
                                    panel = inputt;
                                });
                                let opItem = {
                                    wid: 'card',
                                    data: {
                                        height: '600px',
                                        cards: [
                                            [
                                                {
                                                    'title': '',
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'html',
                                                        data: ``
                                                    }
                                                },
                                                {
                                                    'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                                `                   ,
                                                    'width': '90%',
                                                    'component':
                                                    {

                                                        wid: 'input-param-items',
                                                        refCallback: nameHook,
                                                        data: {
                                                            'input_labels': ['Variant Sequence'],
                                                        }
                                                    }
                                                },
                                                {
                                                    'title': '',
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'mt-button', data: {
                                                            buttons: [
                                                                {
                                                                    label: 'Apply', ionFunction: createIonFunction(async () => {

                                                                        let vs = panel.get('Variant Sequence')
                                                                        if (vs.indexOf('delins') > 0) {
                                                                            let r = mutation_parser.parseInDel(vs);

                                                                            let SnpIndel = await exec('flexigraph/snpindel.js')
                                                                            for (let m of r) {
                                                                                let gi = m.xi;
                                                                                let gf = m.xf;
                                                                                let reference = '';

                                                                                if (vs.startsWith('c.')) {
                                                                                    gi = selectedTrack.genomicToCodingIndex(m.xi)
                                                                                    gf = selectedTrack.genomicToCodingIndex(m.xf)

                                                                                    if (selectedTrack.strand > 0)
                                                                                        reference = selectedTrack.getSequenceRange(gi, gf)
                                                                                    else {
                                                                                        reference = selectedTrack.getSequenceRange(gf, gi)
                                                                                    }
                                                                                } else {
                                                                                    reference = selectedTrack.getSequenceRange(gi, gf)

                                                                                }

                                                                                let sequence = '';
                                                                                if (m.sequence) {
                                                                                    sequence = m.sequence;
                                                                                }

                                                                                let mutation = new SnpIndel(m.type, gi,
                                                                                    reference,
                                                                                    sequence, 0, 1,
                                                                                    gi + ' --- ')

                                                                                selectedTrack.addsnpindel(mutation)

                                                                                let startIndex = selectedTrack.tgraph.X(gi);
                                                                                graph.zoomRect(startIndex - 100,
                                                                                    startIndex + 100, -1 + selectedTrack.y + selectedTrack.tgraph.height,
                                                                                    1 + selectedTrack.y + selectedTrack.tgraph.height, 150);

                                                                            }
                                                                        }
                                                                        else if (vs.indexOf('del') > 0) {

                                                                            let r = mutation_parser.parseDel(vs);

                                                                            let SnpIndel = await exec('flexigraph/snpindel.js')
                                                                            for (let m of r) {
                                                                                let gi = m.xi;
                                                                                let gf = m.xf;

                                                                                let reference = '';
                                                                                if (vs.startsWith('c.')) {
                                                                                    gi = selectedTrack.genomicToCodingIndex(m.xi)
                                                                                    gf = selectedTrack.genomicToCodingIndex(m.xf)

                                                                                    if (selectedTrack.strand > 0)
                                                                                        reference = selectedTrack.getSequenceRange(gi, gf)
                                                                                    else {
                                                                                        reference = selectedTrack.getSequenceRange(gf, gi)
                                                                                    }

                                                                                } else {
                                                                                    reference = selectedTrack.getSequenceRange(gi, gf)
                                                                                }
                                                                                let sequence = '';
                                                                                if (m.sequence) {
                                                                                    sequence = m.sequence;
                                                                                }
                                                                                let mutation = new SnpIndel(m.type, gi,
                                                                                    reference,
                                                                                    sequence, 0, 1,
                                                                                    gi + ' --- ')

                                                                                selectedTrack.addsnpindel(mutation)

                                                                                let startIndex = selectedTrack.tgraph.X(gi);
                                                                                graph.zoomRect(startIndex - 100,
                                                                                    startIndex + 100, -1 + selectedTrack.y + selectedTrack.tgraph.height,
                                                                                    1 + selectedTrack.y + selectedTrack.tgraph.height, 150);

                                                                            }

                                                                        }
                                                                        else
                                                                            if (vs.startsWith('c.') && vs.indexOf('>') > 0) {
                                                                                if (vs == null || vs.length <= 0) {
                                                                                    graph.setMessage(" Enter sequence variant syntax")
                                                                                    return;
                                                                                }
                                                                                let res = mutation_parser.parseSimple(vs);
                                                                                try {

                                                                                    let gindex = genomicToCodingIndex(res.index)
                                                                                    if (isNaN(gindex)) {
                                                                                        console.log(" Failed to get the genomic coordinates ")
                                                                                        return
                                                                                    }

                                                                                    let SnpIndel = await exec('flexigraph/snpindel.js')
                                                                                    let mutation = new SnpIndel("snp", gindex, res.ref, res.sub, 0, 1, '--')
                                                                                    selectedTrack.addsnpindel(mutation)
                                                                                    let startIndex = selectedTrack.tgraph.X(gindex);
                                                                                    graph.zoomRect(startIndex - 100,
                                                                                        startIndex + 100, -1 + selectedTrack.y + selectedTrack.tgraph.height,
                                                                                        1 + selectedTrack.y + selectedTrack.tgraph.height, 150);
                                                                                } catch (e) {
                                                                                    graph.setMessage(e.toString())

                                                                                    showModal({
                                                                                        wid: 'json',
                                                                                        data: e.toString()
                                                                                    })
                                                                                }

                                                                                await hideAllModal();

                                                                            }

                                                                    })
                                                                },
                                                                {
                                                                    label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                        hideAllModal();
                                                                    })
                                                                }
                                                            ]
                                                        }
                                                    }
                                                }
                                            ]]
                                    }
                                }
                                showModal(opItem)
                            }
                        }

        ], x, y)

    })
}
