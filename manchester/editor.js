function (path, config) {

    // Async IIFE wrapper so top-level `await` compiles on BOTH engine paths: exec()/
    // getFunction (AsyncFunction) and run() (plain Function). An early `return` inside
    // resolves the returned promise cleanly, so `await exec('manchester/editor')` callers
    // never hang.
    return (async () => {

    // Subscription gate: block the editor unless an active subscription is confirmed.
    // strict=true → if a subscription is not found (or can't be verified) show the paywall.
    let __sub = await exec('lib/subscription.js');
    if ((await __sub.enforce(true)) === false) return;

    const EditorState = class EditorState {
        paste_to_graph = true;
    }
    let eeditor_state = new EditorState();
    function parseENSTWords(str) {
        const words = str.split(/\s+/);
        const enstWords = words.filter(word => word.toUpperCase().startsWith('ENST'));
        return enstWords;
    }
    function hasMultipleENSTWords(str) {
        const words = str.split(/\s+/);
        const enstWords = words.filter(word => word.toUpperCase().startsWith('ENST'));
        return enstWords.length > 1;
    }
    let user = getUser();
    let pathuser = null;
    if (!user || user.length <= 0) {
        if (path != null && path.length > 0) {
            let t = decodeURIComponent(path)
            const emailPattern = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
            const match = t.match(emailPattern);
            if (match && match[0] != null) {
                pathuser = match[0]
            }
        }
    }







    function idtToBases(str) {
        if (typeof str !== "string") throw new TypeError("Expected a string");
        if (!str.startsWith("/") || !str.endsWith("/")) {
            throw new Error("Not IDT format: must start and end with '/'");
        }

        const tokens = str.split("/");
        if (tokens.length < 3) throw new Error("Not IDT format: too short");

        let out = "";

        for (let i = 1; i < tokens.length - 1; i++) {
            const tok = tokens[i];

            if (tok === "" || tok === "*") continue;

            if (tok.includes("*")) {
                const compact = tok.replace(/\*/g, "");
                if (!compact || !/^[ACGT]+$/.test(compact)) {
                    throw new Error(`Unrecognized token (star-run): "${tok}"`);
                }
                out += compact;
                continue;
            }

            let m = tok.match(/^(?:i)?\d*MOEr([ACGT])$/);
            if (m) {
                out += m[1];
                continue;
            }

            m = tok.match(/^iMe-d([ACGT])$/);
            if (m) {
                out += m[1];
                continue;
            }

            throw new Error(`Unrecognized token: "${tok}"`);
        }

        return out;
    }

    function isIDTFormat(str) {
        try {

            return idtToBases(str).length > 0;
        } catch {
            return false;
        }
    }

    showWidget({
        wid: 'html',
        data: '<hr> Loading... '
    }).then(async working => {




        if (window['env']['auth'] === 'b2c') {
            var result = await verifyUserPath('manchester/editor', 'bajabio-Designer');
            if (!result.allowed) {
                await exec('baja/datayak/ljlcheckout.js', result)
                return;
            }
        } else {





        }

        if (window['env']['auth'] === 'b2c') {

        }

        let progressBar;
        let w = {
            wid: 'progress',
            componentRef: 'progressBar',
            data: {
                'progress': 1,
                'progressBar': createIonFunction((progessBar) => {
                    progressBar = progessBar;
                })
            }
        }
        await showWidget(w)
        progressBar(0);
        path = decodeURIComponent(path)
        let obs = path;

        path = path.trim();

        if (config != null && config.user != null) {
            let parts = path.split('/');
            if (parts[0] === '') {
                parts[1] = '' + getUser();
            } else {
                parts[0] = getUser();
            }
            obs = parts.join('/');
        }

        mouseMode = 'structures'
        exec('flexigraph/gene.js', progressBar).then(async (graph) => {
            cacheOn()
            let io;
            let tracks;
            let genegraph_panel_layout;
            let { Track, TrackRef } = await exec('baja/bio/track.js')
            if (path.endsWith('.baja')) {
                let host_ = window['env']['apiUrl']
                let index = path.lastIndexOf('/')
                if ((config != null && config.user != null) || path.startsWith('/myfiles/')) {

                    let jsonobj = {
                        'path': path,
                        'key': 'user',
                        'user': getUser()
                    }

                    let rs = await POSTJSON(jsonobj, host_ + '/load-file');
                    // Follow share pointers: a lightweight file may just contain
                    // { shared_from: "<real path>" } pointing at the actual screen.
                    if (rs && rs.shared_from) {
                        jsonobj.path = rs.shared_from;
                        if (!jsonobj.path.startsWith('/')) jsonobj.path = '/' + jsonobj.path;
                        rs = await POSTJSON(jsonobj, host_ + '/load-file');
                    }
                    progressBar(45)
                    let p = decodeURIComponent(path).substring(index + 1)
                    if (rs.msg) {
                        clear();
                        log(rs.msg + ' ' + p)
                        return;
                    } else {
                        await graph.update(rs);
                        graph.file = p;
                    }
                } else {
                    let jsonobj = {
                        'path': path,
                        'user': getUser()
                    }
                    let rs = await POSTJSON(jsonobj, host_ + '/load-file');
                    // Follow share pointers: a lightweight file may just contain
                    // { shared_from: "<real path>" } pointing at the actual screen.
                    if (rs && rs.shared_from) {
                        jsonobj.path = rs.shared_from;
                        if (!jsonobj.path.startsWith('/')) jsonobj.path = '/' + jsonobj.path;
                        rs = await POSTJSON(jsonobj, host_ + '/load-file');
                    }
                    progressBar(45)
                    let p = decodeURIComponent(path).substring(index + 1)
                    if (rs.msg && rs.msg.length) {

                        clear();
                        showWidget({
                            wid: 'html',
                            data: "<hr> " + rs.msg
                        })
                        return;

                    } else {
                        await graph.update(rs);
                        graph.file = p;
                    }
                }

            }
            let Icon = await exec('flexigraph/shapes/icon.js')
            graph.folder = path;
            function parseFasta(fastaString) {
                const lines = fastaString.split('\n');
                let sequence = '';
                let description = '';

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();

                    if (line.startsWith('>')) {

                        description = line.substring(1).trim();
                    } else {

                        sequence += line;
                    }
                }

                sequence = sequence.replace(/[^a-zA-Z]/g, '').toUpperCase();

                return {
                    description: description,
                    sequence: sequence,
                };
            }
            function decodeUnicodeEscapes(input) {
                return input.replace(/\\u([\d\w]{4})/gi, (match, grp) => {
                    return String.fromCharCode(parseInt(grp, 16));
                });
            }

            window.addEventListener('dragover', (e) => {
                e.preventDefault();
            });
            window.addEventListener('drop', (e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        let base64String = event.target.result.split(',')[1];
                        let fileBuffer = new TextDecoder('utf-8').decode(new Uint8Array([...base64String].map(char => char.charCodeAt(0))));
                        let binaryString = atob(fileBuffer);
                        if (binaryString.startsWith('>')) {
                            let seqo = parseFasta(binaryString)
                            graph.setMessage(seqo.description + " track from  fasta")
                            let sequence = seqo.sequence;
                            let t = new Track(seqo.description, 0, sequence.length, 1, 1)
                            t.sequence = sequence;
                            graph.addTrack(t);
                            setTimeout(() => {
                                let length = graph.track[graph.track.length - 1].sequence.length;
                                graph.zoomToTrack(graph.track.length - 1, (length * (-0.2)),
                                    length + (length * 0.2))
                            }, 2000)
                        }
                    };
                    reader.readAsDataURL(file);

                }
            });

            let runCL = (imgs) => {
                function isPeptide(sequence) {
                    const regex = /^[ARNDCQEGHILKMFPSTWYV]+$/;
                    return regex.test(sequence);
                }
                if (isModal()) {
                    return;
                }
                let componentToHex = (c) => {
                    const hex = c.toString(16);
                    return hex.length === 1 ? '0' + hex : hex;
                }
                if (graph.getPasteFunction()) {
                    return graph.getPasteFunction()(e);
                }

                let loadInhibitionList = async (dnaSequences, graph) => {
                    let Barchart = await exec('baja/bio/barchart-track.js')
                    let Biopolymer = await exec('baja/chem/biopolymer.js');

                    if (dnaSequences != null && dnaSequences.length > 0) {
                        graph.setMessage("Attempting to map " + dnaSequences.length + " sequences ")
                        let seqlist = []
                        for (let i of dnaSequences) {
                            let s = i.dna;
                            let val = i.number;
                            let uid = i.id;
                            seqlist.push([uid, s, val])
                        }
                        let mapped = 0;
                        for (let t of graph.track) {
                            let sequence = t.sequence.trim();
                            let ed = 1;
                            let res = await exec('py/bio/map/le-map-sequences.py', sequence, seqlist, ed);
                            let index__ = 0;
                            if (res && res.length > 0) {
                                for (let gr of res) {
                                    if (gr && gr.length > 0) {
                                        for (let r of gr) {
                                            if (r[2]) {
                                                let synthesis = r[1]
                                                let bioObject = {
                                                    'trackName': t.name,
                                                    'startIndex': t.xi + r[3],
                                                    'strand': t.strand,
                                                    'endIndex': t.xi + r[3] + r[2].length,
                                                    'y': (t.tgraph.ymax - 0.2)
                                                }
                                                if (r[0].length === 0) {
                                                    r[0] = '' + index__++;
                                                }
                                                console.log(" adding oligo " + r[1])
                                                let compound = Biopolymer.generateDNAOligo(r[0], synthesis, bioObject)
                                                let seq = t.getSequenceRange(compound.xi, compound.xf);
                                                compound.id = r[0];
                                                compound.sequence = seq;
                                                compound.highlight(10000, 'purple')
                                                t.addOligo(compound);
                                                mapped++;
                                                let vorl = seqlist.find(obj => obj[0] === compound.id)
                                                if (vorl[2]) {
                                                    let percent = parseFloat(vorl[2]);
                                                    percent = Math.max(0, Math.min(100, percent));
                                                    const red = Math.floor((100 - percent) * 255 / 100);
                                                    const green = Math.floor(percent * 255 / 100);
                                                    const color = '#' + componentToHex(red) + '00' + componentToHex(green);
                                                    percent = percent / 100;
                                                    let bc = new Barchart(vorl[0], compound.xi, percent, color)
                                                    compound.y = percent
                                                    t.plots.push(bc)

                                                }
                                            }

                                        }
                                    }
                                }
                            } else {
                                graph.setMessage(' It appears there are no matches in the list provided')
                            }
                        }
                        let total = seqlist.length;
                        showModal({
                            wid: 'json',
                            data: JSON.stringify({
                                'Mapped': mapped,
                                'Total': total
                            })
                        })
                    }
                }
                let parseFasta = (fastaString) => {
                    let sequences = [];
                    let fastaArray = fastaString.split('\n');

                    let currentName = null;
                    let currentSequence = [];

                    for (let line of fastaArray) {
                        if (line.startsWith('>')) {
                            if (currentName) {

                                sequences.push({ name: currentName, sequence: currentSequence.join('') });
                            }
                            currentName = line.substring(1).trim();
                            currentSequence = [];
                        } else {

                            currentSequence.push(line.trim());
                        }
                    }

                    if (currentName) {
                        sequences.push({ name: currentName, sequence: currentSequence.join('') });
                    }

                    return sequences;
                }

                let foundImage = false;
                for (var i = 0; i < imgs.length; i++) {
                    if (imgs[i].type.indexOf("image") == -1) continue; else foundImage = true;
                }
                if (!foundImage) {
                    for (var i = 0; i < imgs.length; i++) {
                        if (imgs[i].type.indexOf("text/plain") >= 0) {
                            imgs[i].getAsString(async (s) => {
                                s = s.trim();
                                if (s.startsWith('ENS')) {
                                    if (hasMultipleENSTWords(s.trim())) {
                                        let t = parseENSTWords(s.trim());
                                        let index = 0;
                                        for (let idv of t) {
                                            graph.add(idv.trim(), 10, 10 + index + 1);
                                            index++;
                                        }
                                    } else {
                                        graph.add(s.trim(), 10, 10)
                                    }
                                } else
                                    if (s.startsWith(`{"graph"`)) {
                                        let js = JSON.parse(s);
                                        await graph.setState(js)
                                    } else {

                                        let tableObjects = await exec('baja/io/parse/parse-table.js', s);

                                        if (tableObjects && tableObjects.length > 0) {
                                            let pat = []
                                            let doncbimap = false;
                                            for (let to of tableObjects) {
                                                if (to.id.startsWith('NM_') || to.id.startsWith('NR_'))
                                                    doncbimap = true;
                                                if (to.id)
                                                    pat.push(to.id.trim())
                                            }

                                            graph.setMessage("Loading annotations... ")

                                            {

                                                let mapped_ensembl = await exec('py/ensembl/ncbi_to_ensembl.py', pat.toString())
                                                if (mapped_ensembl) {
                                                    for (let e of mapped_ensembl) {
                                                        if (e != null)
                                                            graph.add(e)
                                                    }
                                                } else {
                                                    graph.setMessage("Failed to load ENSEMBL annotations... ")
                                                }
                                            }
                                        }

                                        if (s != null && s.length > 0 && s.startsWith('>')) {
                                            let sequences = parseFasta(s);
                                            for (let seq of sequences) {
                                                let name = seq.name;

                                                graph.setMessage(name + " track from  fasta")
                                                let sequence = seq.sequence;
                                                let t = new Track(name, 0, sequence.length, 1, 1)
                                                t.sequence = sequence;
                                                graph.track.push(t);
                                            }
                                            setTimeout(() => {
                                                let length = graph.track[graph.track.length - 1].sequence.length;
                                                graph.zoomToTrack(graph.track.length - 1, (length * (-0.2)),
                                                    length + (length * 0.2))
                                            }, 2000)
                                        }
                                        else if (s != null && s.startsWith('c.')) {
                                            let MutationParser = await exec('baja/manchester/menu/annotation/mutation-parser.js');
                                            let SnpIndel = await exec('flexigraph/snpindel.js')
                                            let MutationAnnotation = await exec('flexigraph/mutation-annotation.js')

                                            let mp = new MutationParser();
                                            let mutation = mp.parse(s.trim())

                                            showModal({
                                                wid: 'json',
                                                data: JSON.stringify(mutation)
                                            })

                                            for (let t of graph.track) {
                                                let gi = t.codingToGenomic(mutation.position)
                                                let gf = t.codingToGenomic(mutation.end)
                                                if (gf < t.xf) {
                                                    let ref = t.getSequenceRange(gi, gf)
                                                    if (mutation.type === 'substitution') {
                                                        mutation.type = 'snp'
                                                    } else if (mutation.type === 'insertation') {
                                                        mutation.type = 'ins'
                                                    } else if (mutation.type === 'deletion') {
                                                        mutation.type = 'del'
                                                    }
                                                    sids.push(new SnpIndel(mp.type, gi, ref, mp.sequence, 0, t.strand, Math.random()))
                                                }
                                            }

                                        }
                                        else if (s != null && s.length > 0 && s.startsWith('{')) {
                                            try {
                                                let jsonObject = JSON.parse(s);
                                                if (jsonObject['viewport']) {
                                                    let objects = jsonObject['viewport']['shapes']
                                                    let _tracks = jsonObject['viewport']['track']
                                                    let _tgrid = jsonObject['viewport']['grid']
                                                    let tgrid = Object.assign(new MGrid(), _tgrid);

                                                    graph.graph.rescale();
                                                    let gwidth = graph.graph.width;
                                                    let gheight = graph.graph.height;
                                                    if (gwidth <= 0) {
                                                        console.log(" graph widht is zero ")
                                                        return;
                                                    }

                                                    let tobjects = []
                                                    for (let obj of objects) {
                                                        let xsc = tgrid.X(obj.x);
                                                        let ysc = tgrid.Y(obj.y);
                                                        let wsc = tgrid.screenWidth(obj.w);
                                                        let hsc = tgrid.screenHeight(obj.h);
                                                        obj.x = graph.Xwc(xsc);
                                                        obj.y = graph.Ywc(ysc);
                                                        obj.w = graph.worldWidth(wsc);
                                                        obj.h = graph.worldHeight(hsc);
                                                        tobjects.push(obj)
                                                    }
                                                    graph.addObjects(tobjects);

                                                    let ttracks = {}
                                                    for (let t of _tracks) {
                                                        let xsc = tgrid.X(t.tgraph.xi);
                                                        let ysc = tgrid.Y(t.tgraph.yi);

                                                        let wsc = tgrid.screenWidth(t.tgraph.width);
                                                        let hsc = tgrid.screenHeight(t.tgraph.height);

                                                        t.tgraph.xi = graph.Xwc(xsc);
                                                        t.tgraph.yi = graph.Ywc(ysc);

                                                        if (isFinite(t.tgraph.xi) && isFinite(t.tgraph.yi)) {

                                                            t.tgraph.width = graph.worldWidth(wsc);
                                                            t.tgraph.height = graph.worldHeight(hsc);
                                                            ttracks[t.name] = t
                                                        }

                                                    }
                                                    await graph.addTrackJSONObjects(ttracks);

                                                } else if (jsonObject['type'] && jsonObject['type'] === 'Exon') {
                                                    let t = graph.track;
                                                    for (let tt of t) {
                                                        if (tt.isSelected()) {
                                                            let shapes = await exec('flexigraph/gene-draw.js')
                                                            let Annotation = await exec('flexigraph/annotation.js')
                                                            jsonObject.shapeFunction = getIon(shapes[jsonObject.type])
                                                            tt.add(Object.assign(new Annotation(), jsonObject))
                                                        }
                                                    }
                                                }
                                                else
                                                    if (jsonObject['tgraph']) {
                                                        if (jsonObject.trackRef) {
                                                            let diffx = jsonObject.trackRef.track.tgraph.xi - jsonObject.tgraph.xi;
                                                            let diffy = jsonObject.trackRef.track.tgraph.yi - jsonObject.tgraph.yi;
                                                            jsonObject.trackRef.track.tgraph.xi = graph.xwc - diffx;
                                                            jsonObject.trackRef.track.tgraph.yi = graph.ywc - jsonObject.tgraph.height + diffy;
                                                        }
                                                        jsonObject.tgraph.xi = graph.xwc;
                                                        jsonObject.tgraph.yi = graph.ywc - jsonObject.tgraph.height;
                                                        graph.addTrackJSON(jsonObject);
                                                    }
                                            } catch (exception) {

                                            }

                                        }
                                        else if (s.startsWith('ENST')) {
                                            if (hasMultipleENSTWords(s.trim())) {
                                                let t = parseENSTWords(s.trim());
                                                let index = 0;
                                                for (let idv of t) {
                                                    graph.add(idv.trim(), 10, 10 + index + 1);
                                                    index++;
                                                }
                                            } else {
                                                graph.add(s.trim(), 10, 10)
                                            }
                                        }
                                        else if (s.startsWith('ENSG')) {
                                            graph.add(s.trim(), 10, 10)
                                        } else if (s.startsWith("NM_")) {
                                            graph.add(s.trim(), 10, 10)
                                        }
                                        else {

                                            const dnaPattern = /[ATCG]{10,150}/g;
                                            const dnaSequences = [];
                                            let match;
                                            while ((match = dnaPattern.exec(s)) !== null) {
                                                dnaSequences.push(match[0]);
                                            }

                                            const regex = /([ATCG]{10,200})\s(\d+)/g;
                                            let matches;
                                            let results = [];
                                            while ((matches = regex.exec(s)) !== null) {
                                                results.push({ id: uuid(), dna: matches[1], number: parseInt(matches[2]) });
                                            }
                                            if (results.length > 0) {
                                                loadInhibitionList(results, graph)
                                            } else {
                                                if (dnaSequences != null && dnaSequences.length > 0) {
                                                    graph.setMessage("Attempting to map " + dnaSequences.length + " sequences ")
                                                    let seqlist = []
                                                    let index = 1;
                                                    for (let i of dnaSequences) {
                                                        seqlist.push([index, i])
                                                        index++;
                                                    }

                                                    let pasteSequences = async (seqlist) => {
                                                        let mapped = 0;
                                                        for (let t of graph.track) {
                                                            let sequence = t.sequence.trim();
                                                            let ed = 2;
                                                            let res = await exec('py/bio/map/le-map-sequences.py', sequence, seqlist, ed);
                                                            let index__ = 0;
                                                            if (res && res.length > 0) {
                                                                for (let gr of res) {
                                                                    if (gr && gr.length > 0) {
                                                                        for (let r of gr) {
                                                                            if (r[2]) {
                                                                                let synthesis = r[1]
                                                                                let bioObject = {
                                                                                    'trackName': t.name,
                                                                                    'startIndex': t.xi + r[3],
                                                                                    'strand': t.strand,
                                                                                    'endIndex': t.xi + r[3] + r[2].length,
                                                                                    'y': (t.tgraph.ymax - 0.2)
                                                                                }
                                                                                if (r[0].length === 0) {
                                                                                    r[0] = '' + index__++;
                                                                                }

                                                                                let compound = Biopolymer.generateDNAOligo(r[0], synthesis, bioObject)
                                                                                let seq = t.getSequenceRange(compound.xi, compound.xf);
                                                                                compound.sequence = seq;
                                                                                compound.highlight(10000, 'purple')
                                                                                t.addOligo(compound);
                                                                                mapped++;

                                                                                graph.setMessageCenter(' Mapped ' + compound.sequence, 40)

                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            } else {
                                                                graph.setMessage(' It appears there are no matches in the list provided')
                                                            }
                                                        }
                                                        let total = seqlist.length;
                                                        showModal({
                                                            wid: 'json',
                                                            data: JSON.stringify({
                                                                'Mapped': mapped,
                                                                'Total': total
                                                            })
                                                        })
                                                    }
                                                    pasteSequences(seqlist);

                                                }
                                            }
                                        }
                                    }
                            })

                        }
                    }
                } else {

                    let loaded = false;
                    var img = new Image();
                    if (imgs == undefined) return false;
                    for (var i = 0; i < imgs.length; i++) {
                        if (imgs[i].type.indexOf("image") == -1) continue;
                        var imgObj = imgs[i].getAsFile();
                        var url = window.URL || window.webkitURL;
                        let src = url.createObjectURL(imgObj);
                        img.onload = function (e) {
                            loaded = true;
                            exec('baja/util/ocr-to-table.js', img, graph, genegraph_panel_layout)
                        };
                        img.src = src;
                    }
                    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                    graph.setMouseMode('navigate')

                    graph.selectOff();
                    let ed;
                    const nameHook = createIonFunction((editor) => {
                        ed = editor;
                    })
                    graph.addMouseMoveListener((x, y) => {
                        if (loaded && img)
                            graph.drawImage(img, x, y, graph.worldWidth(img.width), graph.worldHeight(img.height));
                    })
                    graph.addMouseUpListener(async (x, y) => {
                        if (loaded) {
                            let b64 = await getBase64Image(img.src);
                            img.src = b64;
                            let ic = new Icon('base64', img, x, y, graph.worldWidth(img.width), graph.worldHeight(img.height));
                            ic.b64 = b64;
                            graph.shapes.push(ic);
                            loaded = false;
                            img = null;
                        }
                    })
                }
            }

            window.addEventListener('paste', async (e) => {

                console.log(' ' + e.target)

                if (e.localName && e.localName.indexOf('text') >= 0) {
                    return;
                }
                if (e.target && e.target.localName.toString().indexOf('text') >= 0) {
                    return;
                }

                if (eeditor_state.paste_to_graph) {
                    if (e.clipboardData == false) return false;
                    var imgs = e.clipboardData.items;

                    for (let i = 0; i < imgs.length; i++) {
                        let item = imgs[i];
                        if (item.type === 'text/plain') {
                            let val = item.getAsString(async (s) => {
                                s = s.trim();
                                if (isIDTFormat(s)) {
                                    let bases = idtToBases(s)

                                }
                            })
                        }
                    }

                    runCL(imgs)
                }
            })
            graph.addMouseListener((x, y) => {
                io.print(x + ',' + y)
            });
            graph.addListener((_tracks) => {
                tracks = _tracks;

                let index = 0;
                let s = 0;
                let f = 10000;
                for (let t of tracks) {
                    if (index === 0) {

                        s = t.xi;
                        f = t.xf;
                    }
                    if (s > t.xi) {
                        s = t.xi;
                    }
                    if (f < t.xf) {
                        f = t.xf
                    }
                }

            });

            let add = (str) => {
                if (str.startsWith('>')) {
                    graph.fasta(str.trim());
                }
                else {
                    graph.add(str)
                }
            }
            let zoom = (xi, xf) => {
                graph.zoom(xi, xf)
            }
            let track_items = []

            track_items.push({
                'label': 'New RNA track', 'ionfunction': createIonFunction(async () => {
                    await exec('baja/data/prompt-load-transcript.js', window['env']['apiUrl'], graph, genegraph_panel_layout)
                })
            })
            track_items.push({
                'label': 'New Sequence track', 'ionfunction': createIonFunction(() => {
                    exec('baja/manchester/new-track.js', graph, genegraph_panel_layout)
                })
            })

            track_items.push({
                'label': 'Paste...', 'ionfunction': createIonFunction(async () => {

                    await exec('manchester/controls/paste-panel.js', graph, genegraph_panel_layout, eeditor_state)

                })
            })
            track_items.push({
                'label': 'Measure...', 'ionfunction': createIonFunction(() => {
                    exec('baja/manchester/menu/measure-track.js', graph, genegraph_panel_layout)
                })
            })
            track_items.push({
                'label': 'Stats...', ionfunction: createIonFunction(async () => {
                    graph.setMessage("Click on a track to see stat menu for that track");
                    await exec('baja/manchester/menu/track-stats.js', graph)
                })
            })

            track_items.push({
                'label': 'Show...', 'ionfunction': createIonFunction(async () => {
                    exec('baja/manchester/menu/annotation/show-annotations-menu.js', graph)
                })
            })
            track_items.push({
                'label': 'Edit', ionfunction: createIonFunction(async () => {
                    graph.setMessage("Click on a track to see available edit options. ")
                    await exec('baja/manchester/menu/edit-track.js', graph, genegraph_panel_layout)
                })
            })
            track_items.push({
                'label': 'Sequence', ionfunction: createIonFunction(async () => {
                    await exec('baja/manchester/menu/edit-track-sequence.js', graph)
                })
            })

            track_items.push({
                'label': 'Export', ionfunction: createIonFunction(async () => {
                    graph.setMessage("Click on a track to see available edit options. ")
                    await exec('baja/manchester/menu/export-track.js', graph)
                })
            })

            track_items.push({
                'label': 'Clear All', 'ionfunction': createIonFunction(() => {
                    let zoom_to = {
                        wid: 'card',
                        componentRef: 'bottomPanel',
                        data: {
                            height: '800px',
                            cards: [
                                [
                                    {
                                        'title': ' ', 'body': ``
                                        ,
                                        'width': '90%',
                                        'component':
                                        {
                                            wid: 'html',
                                            data: '<font color=red> Are you sure you want to remove all compounds? </font>'
                                        }
                                    },
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'mt-button', data: {
                                                buttons: [
                                                    {
                                                        label: 'Yes', ionFunction: createIonFunction(() => {
                                                            graph.track = []
                                                            graph.setMessage(" All tracks removed.");
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
                    showModal(zoom_to)
                })
            })

            let exptracks = {
                'label': 'Track', 'items': track_items
            }

            let geneGraph = await graph.createComponent();
            geneGraph.height = '100%'
            let button_canvas = await exec('manchester/controls/navigation-panel.js', graph)
            let plates_panel;
            let platePanel = createIonFunction((p) => {
                updateStatsPanel();
                plates_panel = p;
            })

            progressBar(50);

            let updateStatsPanel = () => {
                if (graph) {
                    let ht = ' '
                    let index = 0;
                    let sum = 0;
                    if (graph && graph.track && graph.track.length > 0) {
                        for (let t of graph.track) {
                            ht += `Track${index}:  <font color="blue">${t.oligos.length}</font> <br>`
                            index++;
                            sum += t.oligos.length;
                        }
                    }
                    ht += ''

                    let plates = Math.ceil(sum / 78)
                    ht += `Plates: <font color="blue">${plates} </font>`
                    if (plates_panel) {
                        plates_panel.setHTML(ht);
                    }

                }
            }

            let Biopolymer = await exec('baja/chem/biopolymer.js');
            let CreateCompound = (chem_template_string, track, x, y, type_compoud) => {
                Biopolymer.createCompoundFromOligoScript(chem_template_string, track, x, y, type_compoud)
            }

            let innerComponentCallback = createIonFunction((editor) => {
                io = editor;
            })
            let submittedPanel = async (expid) => {
                return await exec('baja/manchester/my-submitted-screens-w.js', expid)
            }

            let select_display = createIonFunction((ref) => {
                select_display_html = ref;
            })
            let molecule_type_html_render = await exec('baja/manchester/render-moltype.js')
            let display = {
                wid: 'html',
                refCallback: select_display,
                data: {
                    ionFunction: createIonFunction(() => {
                        return ` Selected chemistry template: ` +
                            molecule_type_html_render(graph.props.selected_chemistry)
                    })
                }
            }

            progressBar(55);

            let buttonMenuPanel = {
                wid: 'card',
                componentRef: 'staticPanel',
                data: {
                    cards: [

                        [

                            {
                                'title': '',
                                'component': {
                                    wid: 'card',
                                    componentRef: 'buttonMenuPanel',
                                    data: {
                                        cards: [
                                            [
                                                {
                                                    // Navigation controls now live in the menubar; keep
                                                    // this as an empty swappable slot (Tools > Navigation
                                                    // and other panels still inject content here).
                                                    'title': '',
                                                    'component': { wid: 'html', data: '' }
                                                },
                                            ]]
                                    }
                                }
                            }
                        ]]
                }
            }

            progressBar(60);

            let showPastScreen = async () => {
                let ppanel;
                let nb = createIonFunction((_pan) => {
                    ppanel = _pan;
                });
                let modify_sequence = {
                    wid: 'card',
                    data: {
                        "style.padding-top": '10px',
                        cards: [
                            [

                                {
                                    'title': ' ', 'body': ` `,
                                    'width': '100%',
                                    'component':
                                    {
                                        wid: 'json',
                                        refCallback: nb,

                                        data: ''
                                    }
                                },
                                {
                                    'title': ' ', 'body': ` `,
                                    'width': '100%',
                                    'component':
                                    {
                                        wid: 'mt-button',
                                        data: {
                                            'buttons': [
                                                {
                                                    'label': 'Import', ionFunction: createIon(() => {
                                                        let data = ppanel.getData()
                                                        data = JSON.parse(data);
                                                        graph.update(data);
                                                        hideAllModal();

                                                    }
                                                    )
                                                }, {
                                                    'label': 'Cancel', ionFunction: createIon(() => {

                                                        hideAllModal();

                                                    }),
                                                },
                                            ],
                                        }
                                    }
                                },

                            ]]
                    }
                }
                showModal(modify_sequence, 800, 600);
            }

            let publishSaveScreen = async () => {
                let savedScreens = await exec('manchester/io/publish.js', graph, genegraph_panel_layout)
                showModal(savedScreens);
            }
            let saveSaveScreen = async () => {
                let savedScreens = await exec('manchester/io/save-obj.js', graph, genegraph_panel_layout, path)
                showModal(savedScreens);
            }

            // Save the current screen to the user's PUBLIC folder and produce a view-only
            // link that anyone can open (no login) via manchester/viewer.js.
            let shareScreen = async () => {
                try { if (graph.hideMenu) graph.hideMenu(); } catch (e) { }
                graph.setMessage(' Creating a view-only share link… ');
                try {
                    const host_ = window['env']['apiUrl'];
                    const user = getUser();
                    // Serialize the graph (same replacer as the graph's saveState()).
                    const seen = new WeakSet();
                    const gs = JSON.stringify(graph, function (key, value) {
                        if (key === 'canvas') return;
                        if (typeof value === 'object' && value !== null) {
                            if (Array.isArray(value) && value.every((e) => e && typeof e === 'object' && 'x' in e && 'y' in e)) return value;
                            else if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) return value;
                            else { if (seen.has(value)) return '[a_c]'; seen.add(value); }
                        }
                        return value;
                    });
                    let base = ('' + (graph.file || 'shared')).replace(/\.baja$/i, '').replace(/[^A-Za-z0-9_\- ]+/g, '_').trim() || 'shared';
                    const name = base + '.baja';
                    // 1. Save the screen into the user's public folder.
                    const saveRs = await POSTJSON({ name: name, key: 'user', user: user, spath: 'public', value: gs }, host_ + '/save-user-data');
                    // 2. Grant public read on that folder (.share list; "public" satisfies the
                    //    server's access check for logged-out viewers).
                    try { await POSTJSON({ name: '.share', key: 'user', user: user, spath: 'public', value: 'public\n/public' }, host_ + '/save-user-data'); } catch (e) { }
                    // 3. Build the view-only link from the saved path (/<email>/public/<name>).
                    const sharedPath = (saveRs && saveRs.path) ? saveRs.path : ('/' + user + '/public/' + name);
                    const link = window.location.origin + '/app/manchester/viewer?path=' + encodeURIComponent(sharedPath);
                    try { if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(link); } catch (e) { }
                    showModal({
                        wid: 'html',
                        data: '<div style="padding:18px 20px;font-family:system-ui,-apple-system,Arial;max-width:520px;">'
                            + '<div style="font-size:15px;font-weight:700;margin-bottom:8px;">View-only link created</div>'
                            + '<div style="font-size:12px;color:#475569;margin-bottom:10px;">Copied to your clipboard. Anyone with this link can view this screen — no login required.</div>'
                            + '<div style="font-size:12px;word-break:break-all;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;">'
                            + '<a href="' + link + '" target="_blank" style="color:#1d4ed8;">' + link + '</a></div>'
                            + '</div>'
                    }, 560, 220);
                    graph.setMessage(' View-only link copied to clipboard. ');
                } catch (e) {
                    graph.setMessage(' Could not create share link: ' + e + ' ');
                }
            }
            let goHome = async () => {
                exec('manchester/fb.js', getUser() + '/')
            }

            let openSaveScreen = async () => {
                let savedScreens = await exec('manchester/io/open-obj.js', graph, genegraph_panel_layout)
                showModal(savedScreens);
            }

            let tools_menu = []
            tools_menu = [
                {
                    'label': 'Navigation', 'ionfunction': createIonFunction(async () => {
                        let button_canvas_ = await exec('manchester/controls/navigation-panel.js', graph)
                        CurrentLayout.clearComponent('buttonMenuPanel,labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', button_canvas_);
                    })
                },
                {
                    'label': 'ASO', 'ionfunction': createIonFunction(async () => {
                        graph.showWindowMenu(await exec('baja/manchester/menu/load-chemistry-tools', graph, genegraph_panel_layout), 10, 10, 400)
                    })
                },

                {
                    'label': 'Chemistry', ionfunction: createIonFunction(async () => {

                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        setTimeout(async () => {
                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                            await exec('manchester/choose-chemistry.js', graph, genegraph_panel_layout)
                        }, 100)
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    })
                },

                {
                    'label': 'Assay design', 'ionfunction': createIonFunction(async () => {
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        await exec('baja/manchester/menu/assay-tools.js', graph, genegraph_panel_layout)
                    })
                },

                {
                    'label': 'Models', 'ionfunction': createIonFunction(async () => {
                        graph.showWindowMenu(await exec('baja/manchester/menu/splicing/splicing-tools3', graph, genegraph_panel_layout), 10, 10, 400)
                    })
                }
                ,
                {

                    'label': 'Mutations', 'ionfunction': createIonFunction(async () => {
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        await exec('baja/manchester/menu/variant-tools1.js', graph, genegraph_panel_layout)
                    })

                },

                {
                    'label': 'Annotations', 'ionfunction': createIonFunction(async () => {
                        await exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout, true)
                        await exec('baja/manchester/menu/annotation/annotation-tools2.js', graph, genegraph_panel_layout)
                    })
                },
                {
                    'label': 'Sequence', 'ionfunction': createIonFunction(async () => {
                        graph.showWindowMenu(await exec('baja/manchester/menu/load-seq-tools-menu', graph, genegraph_panel_layout), 10, 10, 400)
                    })
                },

                {
                    'label': 'Protein', 'ionfunction': createIonFunction(async () => {
                        await exec('baja/manchester/menu/protein-annotation-tools.js', graph, genegraph_panel_layout)
                    })
                },
                {
                    'label': 'Draw', 'ionfunction': createIonFunction(async () => {
                        await exec('baja/manchester/menu/draw-tools-simple.js', graph, genegraph_panel_layout)
                    })
                },

                {
                    'label': 'Track Layers', 'ionfunction': createIonFunction(async () => {
                        graph.setMessage(" Select a track to edit layers.")
                        let hl = await exec('baja/manchester/menu/select-track-action-layers.js', graph, genegraph_panel_layout);
                        let select_panel = await exec('baja/manchester/menu/track-layer-editor-panel.js', graph, genegraph_panel_layout)
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', select_panel);

                    })
                }

                ,
                {
                    'label': 'More...', 'ionfunction': createIonFunction(async () => {

                        exec('baja/manchester/menu/tools-menu', graph, genegraph_panel_layout)

                    })
                }
            ]

            progressBar(80);

            let data_menu = []
            let data_items = window['env']['data']
            data_menu.push({
                'label': 'Upload', 'ionfunction': createIonFunction(async () => {
                    const host = window["env"]["appHost"];
                    let url = `${host}/app/manchester/fb`
                    window.open(url, "_blank");

                })
            })
            data_menu.push({
                'label': 'My data', 'ionfunction': createIonFunction(async () => {
                    graph.clearMouseListeners();
                    graph.setMouseMode('navigate')
                    await exec('baja/data/my-data.js', graph, genegraph_panel_layout)
                })
            })

            if (data_items) {
                for (let d of data_items) {
                    data_menu.push({
                        'label': d.label, 'ionfunction': createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            await exec(d.script, d.data, d.server, graph, genegraph_panel_layout)
                        })
                    })
                }
            }

            let autosave = false;

            let file_items = []

            if (user != null && user.length > 0) {
                file_items.push({
                    'label': 'Files', 'ionfunction': createIonFunction(goHome)
                })
                file_items.push({
                    'label': 'Open', 'ionfunction': createIonFunction(openSaveScreen)
                })
                file_items.push({
                    'label': 'Save', 'ionfunction': createIonFunction(saveSaveScreen)
                })
                file_items.push({
                    'label': 'Download SVG', 'ionfunction': createIonFunction(() => {
                        graph.setMessage(" Generating SVG... ")
                        graph.saveToSVG();
                    })
                })

                file_items.push({
                    'label': 'Copy graph', 'ionfunction': createIonFunction(async () => {
                        graph.setMessage(" Copy graph... ")
                        let v = await graph.getState();
                        navigator.clipboard.writeText(v);
                    })
                })

            }

            file_items.push(

                {
                    'label': 'Paste...', 'ionfunction': createIonFunction(async () => {

                        await exec('manchester/controls/paste-panel.js', graph, genegraph_panel_layout, eeditor_state)

                    })

                },
                {
                    'label': 'Import', 'ionfunction': createIonFunction(showPastScreen)
                },
                {
                    'label': 'Bookmarks', 'ionfunction': createIonFunction(async () => {
                        graph.showBookmarkMenu();
                    })
                },
                {
                    'label': 'Export IDT', 'ionfunction': createIonFunction(async () => {
                        let zoom_to = {
                            wid: 'card',
                            componentRef: 'bottomPanel',
                            data: {
                                height: '800px',
                                cards: [
                                    [
                                        {
                                            'title': ' ', 'body': ``
                                            ,
                                            'width': '90%',
                                            'component':
                                            {
                                                wid: 'html',
                                                data: '<font color=red> IDT format is limited to MOE and LNA chemistry.</font>'
                                            }
                                        },
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'OK', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();

                                                                let idt = await exec('baja/chem/structure/idt/idt-format.js');
                                                                let explist = []

                                                                for (let t of graph.track) {
                                                                    let row = 0;
                                                                    let __index = 0;
                                                                    for (let o of t.oligos) {
                                                                        if (__index > 12) {
                                                                            __index = 0;
                                                                        }
                                                                        let well = String.fromCharCode(65 + 8 - __index) + '' + row

                                                                        if (o && o.structure && o.id)
                                                                            explist.push({
                                                                                'well': well,
                                                                                'id': o.idx ? o.idx : o.id,
                                                                                'idt': idt.format(o.structure)
                                                                            })
                                                                    }
                                                                }

                                                                if (explist.length <= 0) {
                                                                    alert('No oligos to export')
                                                                    return;
                                                                }

                                                                downloadAsCsv(explist, 'idt.csv')
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
                        showModal(zoom_to)

                    })
                },
                {
                    'label': 'Export Mermade', 'ionfunction': createIonFunction(async () => {
                        let zoom_to = {
                            wid: 'card',
                            componentRef: 'bottomPanel',
                            data: {
                                height: '800px',
                                cards: [
                                    [
                                        {
                                            'title': ' ', 'body': ``
                                            ,
                                            'width': '90%',
                                            'component':
                                            {
                                                wid: 'html',
                                                data: '<font color=red> IDT format is limited to MOE and LNA chemistry.</font>'
                                            }
                                        },
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'OK', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();

                                                                let idt = await exec('baja/chem/structure/idt/mermade-format.js');
                                                                let explist = [];

                                                                for (let t of graph.track) {

                                                                    let row = 0;
                                                                    let __index = 0;

                                                                    for (let o of t.oligos) {

                                                                        if (__index > 12) {
                                                                            __index = 0;
                                                                            row++;
                                                                        }

                                                                        let well = String.fromCharCode(65 + 8 - __index) + '' + row;

                                                                        if (o && o.structure && o.id) {
                                                                            explist.push({
                                                                                well: well,
                                                                                id: o.idx ? o.idx : o.id + ':',
                                                                                code: idt.format(o.structure)
                                                                            });
                                                                        }

                                                                        __index++;
                                                                    }
                                                                }

                                                                if (explist.length <= 0) {
                                                                    alert('No oligos to export');
                                                                    return;
                                                                }

                                                                let txt = 'well,id,code\n';

                                                                for (let r of explist) {
                                                                    txt += `${r.well},${r.id},${r.code}\n`;
                                                                }

                                                                downloadAsText(txt, 'code.txt');
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
                        showModal(zoom_to)

                    })
                },
                {
                    'label': 'Export Selected to IDT', 'ionfunction': createIonFunction(async () => {

                        let zoom_to = {
                            wid: 'card',
                            componentRef: 'bottomPanel',
                            data: {
                                height: '800px',
                                cards: [
                                    [
                                        {
                                            'title': ' ', 'body': ``
                                            ,
                                            'width': '90%',
                                            'component':
                                            {
                                                wid: 'html',
                                                data: '<font color=red> IDT format is limited to MOE and LNA chemistry.</font>'
                                            }
                                        },
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'OK', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();

                                                                let idt = await exec('baja/chem/structure/idt/idt-format.js');
                                                                let explist = []

                                                                for (let t of graph.track) {
                                                                    let row = 0;
                                                                    let __index = 0;

                                                                    for (let o of t.oligos) {
                                                                        if (o.selected) {
                                                                            if (__index > 12) {
                                                                                __index = 0;
                                                                            }
                                                                            let well = String.fromCharCode(65 + 8 - __index) + '' + row

                                                                            if (o && o.structure && o.id)
                                                                                explist.push({
                                                                                    'well': well,
                                                                                    'id': o.idx ? o.idx : o.id,
                                                                                    'idt': idt.format(o.structure)
                                                                                })
                                                                        }
                                                                    }
                                                                }

                                                                if (explist.length <= 0) {
                                                                    alert('No oligos to export')
                                                                    return;
                                                                }

                                                                downloadAsCsv(explist, 'idt.csv')
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
                        showModal(zoom_to)

                    })
                },
                {
                    'label': 'Export...', 'ionfunction': createIonFunction(async () => {

                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        setTimeout(async () => {
                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                            await exec('manchester/export-graph-options.js', graph, genegraph_panel_layout)
                        }, 100)
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    })

                },
                {
                    'label': 'Clear Graph Layers', 'ionfunction': createIonFunction(async () => {
                        graph.layers = []
                    })
                },

                {
                    'label': 'Export as Bed', 'ionfunction': createIonFunction(async () => {
                        let explist = []
                        for (let t of graph.track) {
                            for (let o of t.oligos) {
                                if (o && o.structure && o.id) {
                                    const chrom_num = 'chr' + t.chr;
                                    const id_seq = o.id + '_' + o.synthesisSequence;
                                    explist.push({
                                        'chrom': chrom_num,
                                        'start': o.xi,
                                        'end': o.xf + 1,
                                        'id': id_seq,
                                        'score': '.',
                                        'strand': t.strand == 1 ? '+' : '-'
                                    })
                                }
                            }
                        }
                        downloadAsTsv(explist, 'asos.bed', '\t')
                    })
                },
            ),
            {
                'label': 'Layers', 'ionfunction': createIonFunction(async () => {
                    graph.setMessage(" Select a track to edit layers.")
                    let hl = await exec('baja/manchester/menu/select-track-action-layers.js', graph, genegraph_panel_layout);

                })
            }

            if (graph.autosave) {
                file_items.push({
                    'label': 'Turn off autosave', 'ionfunction': createIonFunction(async () => {
                        graph.autosave = false;
                    })
                })
            } else {
                file_items.push({
                    'label': 'Turn on autosave', 'ionfunction': createIonFunction(async () => {
                        graph.autosave = true;
                    })
                })

            }

            if (getUser().indexOf("milton") >= 0) {

                file_items.push(

                    {
                        label: 'Train-tracks',
                        ionfunction: createIonFunction(() => {
                            let host = window["env"]["appHost"];
                            if (!host.startsWith('https'))
                                host = `https://${host}`
                            let url = `${host}/app/baja/train-tracks`
                            window.open(url, "_blank");
                        })

                    }

                )
            }

            // Build a menubar copy of the navigation buttons with group separators
            // (pan | zoom | bookmark | tools). This is a NEW array — the shared
            // button-canvas array (button_canvas.data.buttons) is left untouched.
            let menubarNavButtons = (() => {
                let src = (button_canvas &&
                    (button_canvas.buttons || (button_canvas.data && button_canvas.data.buttons))) || [];
                const groups = [
                    ['left', 'right', 'up', 'down'],
                    ['zoom out', 'zoom in', 'expand up', 'expand down', 'resize x', 'expand'],
                    ['bookmark', 'show bookmark'],
                    ['show tracks', 'map oligos', 'move options', 'box zoom', 'lasso things', 'lasso']
                ];
                const groupIndex = (label) => {
                    const l = (label || '').toString().trim().toLowerCase();
                    for (let i = 0; i < groups.length; i++) if (groups[i].includes(l)) return i;
                    return -1;
                };
                let out = [];
                let prev = null;
                for (let b of src) {
                    const gi = groupIndex(b && b.label);
                    if (prev !== null && gi !== -1 && gi !== prev) out.push({ separator: true });
                    if (gi !== -1) prev = gi;
                    out.push(b);
                }
                return out;
            })();

            // Installed news/message list (server-side; seeded on first install). Rendered as
            // a dismissible NEWSPAPER card centered over the canvas at startup, so the gene
            // graph keeps its full screen real estate — no permanent top panel.
            let __newsMsgs = [];
            try {
                let __nem = new EngineMonitor(() => { });
                let __nr = await exec('py/bio/get-news.py', __nem);
                try { __newsMsgs = JSON.parse(__nr.messages) || []; } catch (e) { __newsMsgs = []; }
            } catch (e) { __newsMsgs = []; }

            const __showNewspaper = (messages) => {
                try {
                    const esc = (s) => ('' + s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const old = document.getElementById('baja-news-overlay');
                    if (old) old.remove();
                    let dateStr = '';
                    try { dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { }
                    const articles = (messages || []).map((m, i) =>
                        '<div style="' + (i > 0 ? 'border-top:1px solid #cbb6a0; padding-top:10px; margin-top:10px;' : '') + '">'
                        + '<div style="font-size:17px; font-weight:700; line-height:1.3;">' + esc(m) + '</div>'
                        + '</div>'
                    ).join('');
                    const wrap = document.createElement('div');
                    wrap.id = 'baja-news-overlay';
                    wrap.style.cssText = 'position:fixed; z-index:99999; left:50%; top:46%; transform:translate(-50%,-50%); width:min(560px,86vw); cursor:pointer;';
                    wrap.innerHTML =
                        '<div style="background:#f6f1e3; color:#1a1a1a; border:2px solid #1a1a1a; box-shadow:0 16px 48px rgba(0,0,0,0.42); padding:20px 24px; font-family:Georgia,\'Times New Roman\',serif;">'
                        + '<div style="text-align:center; border-bottom:4px double #1a1a1a; padding-bottom:8px; margin-bottom:12px;">'
                        + '<div style="font-size:34px; font-weight:900; letter-spacing:1px; font-variant:small-caps; line-height:1;">The Baja Times</div>'
                        + '<div style="font-size:11px; text-transform:uppercase; letter-spacing:2px; color:#555; margin-top:6px;">' + esc(dateStr) + ' &nbsp;&bull;&nbsp; Genomics Edition</div>'
                        + '</div>'
                        + articles
                        + '<div style="text-align:center; font-size:10px; color:#8a8172; margin-top:14px; border-top:1px solid #cbb6a0; padding-top:8px; font-family:system-ui,sans-serif;">click to dismiss</div>'
                        + '</div>';
                    const __dismiss = () => {
                        try { wrap.remove(); } catch (e) { }
                        try { document.removeEventListener('mousedown', __onDoc, true); } catch (e) { }
                    };
                    const __onDoc = (ev) => {
                        try { if (!wrap.contains(ev.target)) __dismiss(); } catch (e) { __dismiss(); }
                    };
                    wrap.addEventListener('click', __dismiss);
                    document.body.appendChild(wrap);
                    // Click anywhere outside the newspaper to dismiss it (added on the next
                    // tick so the click that opened it doesn't immediately close it).
                    setTimeout(() => { try { document.addEventListener('mousedown', __onDoc, true); } catch (e) { } }, 0);
                    setTimeout(__dismiss, 20000);
                } catch (e) { }
            };

            genegraph_panel_layout = {
                wid: 'card',
                componentRef: 'geneGraphPanel',
                data: {
                    cards: [
                        [

                            {
                                'width': '100%',
                                'component': {
                                    wid: 'button-menu',
                                    data: {
                                        // Circular labelled buttons — the only controls now.
                                        buttons: [
                                            {
                                                label: 'File', ionFunction: createIonFunction(() => {
                                                    graph.showMenu([
                                                        {
                                                            label: 'New', move: () => { },
                                                            click: async () => {
                                                                graph.hideMenu();
                                                                // Clear everything and relaunch a fresh editor, and reset the
                                                                // URL to the bare editor (no ?path=...) — same pattern used to
                                                                // launch a brand-new editor elsewhere.
                                                                const __fresh = () => {
                                                                    try { window.history.pushState({ 'yak': '/' + getUser() }, 'editor', '/app/manchester/editor'); } catch (e) { }
                                                                    exec('manchester/editor');
                                                                };
                                                                try {
                                                                    const c = await exec('baja/lib/confirm.js', 'Clear everything and start fresh? Unsaved changes will be lost.', __fresh);
                                                                    showModal(c);
                                                                } catch (e) { __fresh(); }
                                                            }
                                                        },
                                                        { label: 'Open', click: () => { graph.hideMenu(); openSaveScreen(); }, move: () => { } },
                                                        { label: 'Save', click: () => { graph.hideMenu(); saveSaveScreen(); }, move: () => { } },
                                                        {
                                                            label: 'Share (view-only link)', move: () => { },
                                                            click: async () => {
                                                                graph.hideMenu();
                                                                // Confirm PUBLIC sharing first — the resulting link needs no login.
                                                                try {
                                                                    const c = await exec('baja/lib/confirm.js',
                                                                        'Publish this screen PUBLICLY? Anyone with the link will be able to VIEW it (read-only) — no login required. Do not share sensitive data.',
                                                                        () => { shareScreen(); },
                                                                        'Share publicly');
                                                                    showModal(c);
                                                                } catch (e) { shareScreen(); }
                                                            }
                                                        },
                                                    ], 0, 0, 280);
                                                })
                                            },
                                            {
                                                label: 'Track', ionFunction: createIonFunction(() => {
                                                    // Show the track-tools toolbar in the button/label panel.
                                                    exec('baja/manchester/menu/track-tools-toolbar.js', graph, genegraph_panel_layout);
                                                    // Centered menu: New track | Edit track.
                                                    graph.showMenu([
                                                        {
                                                            label: 'New track', move: () => { },
                                                            click: () => {
                                                                // Open the new-track window directly.
                                                                graph.showSideMenu(null);
                                                                exec('baja/data/prompt-load-transcript.js', window['env']['apiUrl'], graph, genegraph_panel_layout);
                                                            }
                                                        },
                                                        {
                                                            label: 'Edit track', move: () => { },
                                                            click: () => {
                                                                graph.showSideMenu(null);
                                                                graph.setMessage('Click on a track to see available edit options. ');
                                                                exec('baja/manchester/menu/edit-track.js', graph, genegraph_panel_layout);
                                                            }
                                                        },
                                                        {
                                                            label: 'Export', move: () => { },
                                                            click: () => {
                                                                graph.showSideMenu(null);
                                                                // Click a track, then choose an export (BED, oligos as
                                                                // FASTA/HELM/IDT, primers as CSV for Excel).
                                                                exec('baja/manchester/menu/track-export-menu.js', graph, genegraph_panel_layout);
                                                            }
                                                        }
                                                    ]);
                                                })
                                            },
                                            {
                                                label: 'Draw', ionFunction: createIonFunction(() => {
                                                    // Entering Draw: hide the info / selection panel and clear any selection.
                                                    graph.showDisplay = false;
                                                    try {
                                                        if (graph.clearSelectionVisuals) graph.clearSelectionVisuals();
                                                        graph.__lassoSelection = [];
                                                    } catch (e) { }
                                                    if (graph.wake) graph.wake();
                                                    // First-click center menu: Sequence | Sketch.
                                                    graph.showMenu([
                                                        {
                                                            label: 'Sequence', move: () => { }, click: () => {
                                                                graph.hideMenu();
                                                                // Side menu of sequence-annotation options (incl. protein sequence).
                                                                graph.showSideMenu([
                                                                    {
                                                                        label: 'Annotate by description...', move: () => { log(''); }, click: async () => {
                                                                            graph.showSideMenu(null);
                                                                            await exec('baja/data/prompt-action.js', window['env']['apiUrl'], graph, genegraph_panel_layout, 'annotate');
                                                                        }
                                                                    },
                                                                    {
                                                                        label: 'Select', move: () => { log(''); }, click: () => {
                                                                            // Arm click-and-drag sequence selection right away (default), so the
                                                                            // user can start selecting immediately — the menu below still lets
                                                                            // them switch to Box drag.
                                                                            // true → show annotation tools for the selected sequence on release.
                                                                            exec('baja/manchester/menu/select-sequence.js', graph, genegraph_panel_layout, true);
                                                                            // Choose a selection interaction for the sequence (center menu).
                                                                            graph.showMenu([
                                                                                {
                                                                                    label: 'Click and drag on a track', move: () => { }, click: () => {
                                                                                        if (graph.hideMenu) graph.hideMenu();
                                                                                        // true → show annotation tools for the selected sequence on release.
                                                                                        exec('baja/manchester/menu/select-sequence.js', graph, genegraph_panel_layout, true);
                                                                                    }
                                                                                },
                                                                                {
                                                                                    label: 'Box drag', move: () => { }, click: () => {
                                                                                        if (graph.hideMenu) graph.hideMenu();
                                                                                        exec('baja/manchester/menu/select-box-sequence.js', graph, genegraph_panel_layout);
                                                                                    }
                                                                                }
                                                                            ]);
                                                                        }
                                                                    },
                                                                    {
                                                                        label: 'Sequence tools', move: () => { log(''); }, click: () => {
                                                                            graph.showSideMenu(null);
                                                                            exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout);
                                                                        }
                                                                    },
                                                                    {
                                                                        label: 'Protein sequence', move: () => { log(''); }, click: () => {
                                                                            graph.showSideMenu(null);
                                                                            exec('baja/manchester/menu/protein-annotation-tools.js', graph, genegraph_panel_layout);
                                                                        }
                                                                    },
                                                                    {
                                                                        label: 'Annotations', move: () => { log(''); }, click: () => {
                                                                            graph.showSideMenu(null);
                                                                            exec('baja/manchester/menu/annotation/annotation-tools2.js', graph, genegraph_panel_layout);
                                                                        }
                                                                    },
                                                                    {
                                                                        label: 'Show / hide annotations', move: () => { log(''); }, click: () => {
                                                                            graph.showSideMenu(null);
                                                                            exec('baja/manchester/menu/annotation/show-annotations-menu.js', graph);
                                                                        }
                                                                    }
                                                                ]);
                                                            }
                                                        },
                                                        {
                                                            label: 'Sketch', move: () => { }, click: () => {
                                                                graph.hideMenu();
                                                                graph.showSideMenu(null);
                                                                // Drawing tools (rectangle / oval / line / freehand) for the canvas.
                                                                exec('baja/manchester/menu/draw-tools-simple.js', graph, genegraph_panel_layout);
                                                            }
                                                        },
                                                        {
                                                            label: 'Variant', move: () => { }, click: () => {
                                                                graph.hideMenu();
                                                                graph.showSideMenu(null);
                                                                // Describe a variant → Claude resolves type & genomic position, place it
                                                                // on every track it can live on, and zoom into the last one added.
                                                                exec('baja/data/prompt-variant.js', window['env']['apiUrl'], graph, genegraph_panel_layout);
                                                            }
                                                        }
                                                    ]);
                                                })
                                            },
                                            {
                                                label: 'Layers', ionFunction: createIonFunction(() => {
                                                    // Show the layers-tools toolbar in the button/label panel.
                                                    exec('baja/manchester/menu/track-layer-editor-panel.js', graph, genegraph_panel_layout);
                                                    // Centered menu of layer actions.
                                                    graph.showMenu([
                                                        {
                                                            label: 'Models', move: () => { },
                                                            click: () => {
                                                                graph.showSideMenu(null);
                                                                // Show the predictive-models toolbar (Models | Layers).
                                                                exec('baja/ml/predictive-models-toolbar.js', graph, genegraph_panel_layout);
                                                            }
                                                        },
                                                        {
                                                            label: 'Data', move: () => { },
                                                            click: () => {
                                                                graph.showSideMenu(null);
                                                                // Show the data-loading toolbar.
                                                                exec('baja/data/data-loading-toolbar.js', graph, genegraph_panel_layout);
                                                            }
                                                        },
                                                        {
                                                            label: 'Edit', move: () => { },
                                                            click: () => {
                                                                graph.showSideMenu(null);
                                                                // Prompt to click a track, then open its layer editor.
                                                                graph.clearMouseListeners();
                                                                graph.setMouseMode("msg: Click on a track to edit its layers.");
                                                                graph.addMouseDownListener(async (x, y) => {
                                                                    const ti = graph.getTrack(x, y);
                                                                    if (ti < 0) return;
                                                                    const track = graph.track[ti];
                                                                    graph.clearMouseListeners();
                                                                    graph.setMouseMode('navigate');
                                                                    try {
                                                                        await exec('baja/manchester/menu/select-track-action-layers-edit-panel.js', track, genegraph_panel_layout, graph);
                                                                    } catch (e) { graph.setMessage(' Could not open the layer editor: ' + e); }
                                                                });
                                                            }
                                                        }
                                                    ]);
                                                })
                                            },
                                            {
                                                label: 'Design', ionFunction: createIonFunction(() => {
                                                    // Also show the compound editor in the button/label panel.
                                                    exec('baja/manchester/menu/compound-editor.js', graph, genegraph_panel_layout);
                                                    graph.showMenu([
                                                        {
                                                            label: 'Select sequence', move: () => { },
                                                            click: () => {
                                                                graph.showMenu([
                                                                    {
                                                                        label: 'Click and drag on a track', move: () => { }, click: () => {
                                                                            if (graph.hideMenu) graph.hideMenu();
                                                                            exec('baja/manchester/menu/select-sequence.js', graph, genegraph_panel_layout, true);
                                                                        }
                                                                    },
                                                                    {
                                                                        label: 'Box drag', move: () => { }, click: () => {
                                                                            if (graph.hideMenu) graph.hideMenu();
                                                                            exec('baja/manchester/menu/select-box-sequence.js', graph, genegraph_panel_layout);
                                                                        }
                                                                    }
                                                                ]);
                                                            }
                                                        },
                                                        {
                                                            label: 'Primer-probe', move: () => { },
                                                            click: () => {
                                                                graph.showSideMenu(null);

                                                                // Design primers on a sequence, letting the user pick the method:
                                                                //  - primer3: the primer3 python package (generate-ppsets.py) with the
                                                                //    designed primers placed on the track (apply-primer3.js).
                                                                //  - djPrimer: primer3 design ranked by the assay-success model (JSON).
                                                                // xoffset is where seq starts in the track (for placing primers).
                                                                const chooseMethodAndRun = (track, seq, xoffset) => {
                                                                    if (!seq || !seq.length) { graph.setMessage(' No sequence to design on. '); return; }
                                                                    const runPrimer3 = async () => {
                                                                        graph.pushOntoHistory();
                                                                        graph.setMessage(' Generating primers (primer3)... ');
                                                                        let em = new EngineMonitor((msg) => { try { graph.setMessage(msg); } catch (e) { } });
                                                                        let r = await exec('/py/ppsets/generate-ppsets.py', em, '' + seq, '', 1);
                                                                        await exec('baja/manchester/ppsets/apply-primer3.js', r, xoffset || 0, track, graph);
                                                                        if (graph.wake) graph.wake();
                                                                        graph.setMessage(' Primers designed and placed on ' + (track.name || 'track') + '. ');
                                                                        try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
                                                                    };
                                                                    const runDjprimer = async () => {
                                                                        graph.pushOntoHistory();
                                                                        graph.setMessage(' Designing primers (djPrimer)... ');
                                                                        const gene = track.geneID || track.name || '';
                                                                        let r = await exec('py/ppsets/models/find-primer-amplicons.py', '' + seq, '', '', JSON.stringify({ scorer: 'djprimer', gene: '' + gene }));
                                                                        // track.ampliconResults = r;
                                                                        await exec('baja/manchester/ppsets/apply-djprimer.js', r, xoffset || 0, track, graph);
                                                                        if (graph.wake) graph.wake();
                                                                        try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
                                                                    };
                                                                    graph.showMenu([
                                                                        { label: 'primer3', move: () => { }, click: () => { if (graph.hideMenu) graph.hideMenu(); runPrimer3(); } },
                                                                        { label: 'djPrimer ', move: () => { }, click: () => { if (graph.hideMenu) graph.hideMenu(); runDjprimer(); } }
                                                                    ]);
                                                                };

                                                                // Step 1: click a track. Step 2: whole track or a drag-selected range.
                                                                const startDesignNew = () => {
                                                                    graph.clearMouseListeners();
                                                                    graph.setMouseMode('msg: Click on a track to design primers.');
                                                                    graph.addMouseDownListener(async (x, y) => {
                                                                        const ti = graph.getTrack(x, y);
                                                                        if (ti < 0) return;
                                                                        const track = graph.track[ti];
                                                                        graph.clearMouseListeners();
                                                                        graph.setMouseMode('navigate');
                                                                        graph.showMenu([
                                                                            {
                                                                                label: 'Design on entire track', move: () => { },
                                                                                click: () => {
                                                                                    if (graph.hideMenu) graph.hideMenu();
                                                                                    // xoffset is the 0-based offset into the track sequence where the
                                                                                    // designed region starts. createPrimerProbe already adds track.xi, so
                                                                                    // the whole track starts at offset 0 (not track.xi).
                                                                                    chooseMethodAndRun(track, track.getSequenceRange(track.xi, track.xf), 0);
                                                                                }
                                                                            },
                                                                            {
                                                                                label: 'Select sequence range', move: () => { },
                                                                                click: () => {
                                                                                    if (graph.hideMenu) graph.hideMenu();
                                                                                    // Drag on the track to mark a range, then design on it.
                                                                                    try { graph.showSideMenu(null); } catch (e) { }
                                                                                    graph.side_menu = null;   // else the engine skips move listeners
                                                                                    graph.clearMouseListeners();
                                                                                    graph.deselectAllTracks();
                                                                                    graph.setMouseMode('msg: Click and drag to select the sequence range.');
                                                                                    let md = false, s = 0, e = 0;
                                                                                    graph.addMouseDownListener((mx, my) => {
                                                                                        md = true;
                                                                                        s = Math.ceil(track.tgraph.Xwc(mx) - track.tgraph.xi * 2);
                                                                                        e = s;
                                                                                        track.select();
                                                                                    });
                                                                                    graph.addMouseMoveListener((mx, my) => {
                                                                                        if (md && track.tgraph) {
                                                                                            e = Math.ceil(track.tgraph.Xwc(mx) - track.tgraph.xi * 2);
                                                                                            track.highlight(Math.min(s, e), Math.max(s, e));
                                                                                            if (graph.wake) graph.wake();
                                                                                        }
                                                                                    });
                                                                                    graph.addMouseUpListener((mx, my) => {
                                                                                        md = false;
                                                                                        e = Math.ceil(track.tgraph.Xwc(mx) - track.tgraph.xi * 2);
                                                                                        graph.clearMouseListeners();
                                                                                        graph.setMouseMode('navigate');
                                                                                        const a = Math.min(s, e), b = Math.max(s, e);
                                                                                        if (b - a < 40) { graph.setMessage(' Selection too small — drag a wider range. '); return; }
                                                                                        // xoffset = 0-based offset into the track sequence (a is track.xi-based).
                                                                                        chooseMethodAndRun(track, track.getSequenceRange(a, b), a - track.xi);
                                                                                    });
                                                                                }
                                                                            }
                                                                        ]);
                                                                    });
                                                                };

                                                                // Edit mode: click any existing amplicon's primer/probe and drag it in X.
                                                                // Re-reads the sequence under the primer so Tm/GC update as it moves.
                                                                const startEditExisting = () => {
                                                                    graph.clearMouseListeners();
                                                                    try { graph.showSideMenu(null); } catch (e) { }
                                                                    graph.side_menu = null;   // else the engine skips move listeners
                                                                    graph.setMouseMode('msg: Edit primer-probes — click a primer and drag left/right. Click empty space to finish.');
                                                                    let grab = null;
                                                                    const findHit = (mx) => {
                                                                        for (let t of (graph.track || [])) {
                                                                            if (!t || !t.tgraph || !Array.isArray(t.oligos)) continue;
                                                                            const tg = t.tgraph;
                                                                            const wx = (mx - tg.xinset - tg.xi) / (tg.xscale || 1) - tg.xshift;
                                                                            for (let o of t.oligos) {
                                                                                if (!o || o.type !== 'amplicon') continue;
                                                                                for (let p of [o.left, o.right, o.mid]) {
                                                                                    if (!p) continue;
                                                                                    const lo = Math.min(+p.xi, +p.xf), hi = Math.max(+p.xi, +p.xf);
                                                                                    const tol = Math.max(1, (hi - lo) * 0.15);
                                                                                    if (wx >= lo - tol && wx <= hi + tol) return { track: t, amp: o, part: p, wx };
                                                                                }
                                                                            }
                                                                        }
                                                                        return null;
                                                                    };
                                                                    graph.addMouseDownListener((mx, my) => {
                                                                        const h = findHit(mx);
                                                                        if (!h) { graph.clearMouseListeners(); graph.setMouseMode('navigate'); if (graph.wake) graph.wake(); return; }
                                                                        try { graph.pushOntoHistory(); } catch (e) { }
                                                                        grab = { track: h.track, amp: h.amp, part: h.part, startXi: +h.part.xi, startXf: +h.part.xf, down: h.wx };
                                                                    });
                                                                    graph.addMouseMoveListener((mx, my) => {
                                                                        if (!grab) return;
                                                                        const tg = grab.track.tgraph;
                                                                        const wx = (mx - tg.xinset - tg.xi) / (tg.xscale || 1) - tg.xshift;
                                                                        const d = Math.round(wx - grab.down);
                                                                        grab.part.xi = grab.startXi + d;
                                                                        grab.part.xf = grab.startXf + d;
                                                                        try {
                                                                            const lo = Math.min(grab.part.xi, grab.part.xf), hi = Math.max(grab.part.xi, grab.part.xf);
                                                                            const seq = grab.track.getSequenceRange(lo, hi);
                                                                            if (seq && seq.length) grab.part.sequence = seq;
                                                                        } catch (e) { }
                                                                        if (grab.amp.left && grab.amp.right) {
                                                                            grab.amp.xi = Math.min(+grab.amp.left.xi, +grab.amp.right.xi);
                                                                            grab.amp.xf = Math.max(+grab.amp.left.xf, +grab.amp.right.xf);
                                                                        }
                                                                        if (graph.wake) graph.wake();
                                                                    });
                                                                    graph.addMouseUpListener(() => { grab = null; if (graph.wake) graph.wake(); });
                                                                };

                                                                // If amplicons already exist on any track, offer design-new vs edit-existing.
                                                                const hasAmplicons = () => (graph.track || []).some(t => Array.isArray(t?.oligos) && t.oligos.some(o => o && o.type === 'amplicon'));
                                                                if (hasAmplicons()) {
                                                                    graph.showMenu([
                                                                        { label: 'Design new...', move: () => { }, click: () => { if (graph.hideMenu) graph.hideMenu(); startDesignNew(); } },
                                                                        { label: 'Edit existing...', move: () => { }, click: () => { if (graph.hideMenu) graph.hideMenu(); startEditExisting(); } }
                                                                    ]);
                                                                } else {
                                                                    startDesignNew();
                                                                }
                                                            }
                                                        },
                                                        {
                                                            label: 'ASO/siRNA', move: () => { },
                                                            click: () => {
                                                                graph.showSideMenu([
                                                                    {
                                                                        label: 'Choose chemistry', move: () => { },
                                                                        click: () => {
                                                                            graph.showSideMenu(null);
                                                                            exec('manchester/choose-chemistry.js', graph, genegraph_panel_layout);
                                                                        }
                                                                    },
                                                                    {
                                                                        label: 'Drop on track location', move: () => { },
                                                                        click: async () => {
                                                                            graph.showSideMenu(null);
                                                                            const hasChem = () => !!(graph.props && graph.props.selected_chemistry);
                                                                            if (hasChem()) {
                                                                                exec('baja/manchester/menu/draw-oligos.js', graph);
                                                                                return;
                                                                            }
                                                                            // No chemistry chosen — prompt for one, then resume the drop flow.
                                                                            graph.setMessage(' Select a chemistry, then click a track to drop the compound. ');
                                                                            await exec('manchester/choose-chemistry.js', graph, genegraph_panel_layout);
                                                                            let waited = 0;
                                                                            const resume = () => {
                                                                                if (hasChem()) {
                                                                                    // Let choose-chemistry's own follow-up settle, then take over the
                                                                                    // mouse listeners for click-to-drop.
                                                                                    setTimeout(() => exec('baja/manchester/menu/draw-oligos.js', graph), 1500);
                                                                                } else if (waited < 120000) {
                                                                                    waited += 500;
                                                                                    setTimeout(resume, 500);
                                                                                }
                                                                            };
                                                                            setTimeout(resume, 800);
                                                                        }
                                                                    },
                                                                    {
                                                                        label: 'Select sequence range', move: () => { },
                                                                        click: () => {
                                                                            graph.showSideMenu(null);
                                                                            exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout, true);
                                                                        }
                                                                    },
                                                                    {
                                                                        label: 'Design by rules (tile & score)', move: () => { },
                                                                        click: () => {
                                                                            graph.showSideMenu(null);
                                                                            exec('baja/manchester/menu/tile-oligos-design.js', graph, genegraph_panel_layout);
                                                                        }
                                                                    },
                                                                    {
                                                                        label: 'Filter by off-targets', move: () => { },
                                                                        click: () => {
                                                                            graph.showSideMenu(null);
                                                                            // Click a track, enter a max off-target count, and any oligo
                                                                            // exceeding it is auto-removed (reports "removed ${id} with OT #").
                                                                            exec('baja/manchester/menu/filter-oligos-by-offtargets.js', graph, genegraph_panel_layout);
                                                                        }
                                                                    },
                                                                    {
                                                                        label: 'Run off-targets & filter (live)', move: () => { },
                                                                        click: () => {
                                                                            graph.showSideMenu(null);
                                                                            // Click a track, enter a max, pick genome + edit distance; oligos
                                                                            // over the max are removed in real time as results return.
                                                                            exec('baja/manchester/menu/filter-run-offtargets.js', graph, genegraph_panel_layout);
                                                                        }
                                                                    },
                                                                ]);
                                                            }
                                                        },
                                                        {
                                                            // "edit" dismisses the center menu (same as Cancel), leaving
                                                            // the compound editor in the button/label panel to work in.
                                                            label: 'Edit...', move: () => { },
                                                            click: () => { graph.hideMenu(); try { graph.setMouseMode('navigate'); } catch (e) { } }
                                                        },
                                                    ], 0, 0, 300);
                                                })
                                            },
                                            {
                                                label: 'Navigate', ionFunction: createIonFunction(async () => {
                                                    graph.showMenu([
                                                        {
                                                            label: 'View all', move: () => { },
                                                            click: async () => {
                                                                if (graph.hideMenu) graph.hideMenu();
                                                                try { await graph.viewAllTracks(); } catch (e) { }
                                                                try {
                                                                    graph.clearMouseListeners();
                                                                    graph.setMouseMode('navigate');
                                                                    exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout);
                                                                } catch (e) { }
                                                            }
                                                        },
                                                        {
                                                            label: 'View track...', move: () => { },
                                                            click: () => {
                                                                // Second center menu: one item per track (name + annotation);
                                                                // clicking zooms to that track.
                                                                const items = (graph.track || []).filter(t => t && t.tgraph).map(t => {
                                                                    const annot = t.description || t.geneID
                                                                        || (Array.isArray(t.annotations) && t.annotations[0] && t.annotations[0].name)
                                                                        || t.track_type || '';
                                                                    return {
                                                                        label: (t.name || 'track') + (annot ? '  —  ' + annot : ''),
                                                                        move: () => { },
                                                                        click: async () => {
                                                                            if (graph.hideMenu) graph.hideMenu();
                                                                            try { await graph.zoomToTrack(t); } catch (e) { }
                                                                            try {
                                                                                graph.clearMouseListeners();
                                                                                graph.setMouseMode('navigate');
                                                                                exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout);
                                                                            } catch (e) { }
                                                                        }
                                                                    };
                                                                });
                                                                if (!items.length) { graph.setMessage(' No tracks to view. '); return; }
                                                                graph.showMenu(items);
                                                            }
                                                        },
                                                        {
                                                            label: 'Where do you want to go?', move: () => { },
                                                            click: async () => {
                                                                if (graph.hideMenu) graph.hideMenu();
                                                                await exec('baja/data/prompt-action.js', window['env']['apiUrl'], graph, genegraph_panel_layout, 'navigate');
                                                            }
                                                        },
                                                        {
                                                            label: 'History', move: () => { },
                                                            click: async () => {
                                                                // Side menu to step backward/forward through recorded views
                                                                // (grid states that were held still for >2s).
                                                                if (graph.hideMenu) graph.hideMenu();
                                                                await exec('baja/manchester/menu/view-history-menu.js', graph, genegraph_panel_layout);
                                                            }
                                                        }
                                                    ]);
                                                })
                                            }
                                        ],
                                        // The dropdown menus below are ignored by the button-menu widget.
                                        menus: [

                                            {
                                                'label': 'Apps', 'items': [{
                                                    'label': 'Assay Design', 'ionfunction': createIonFunction(async () => {
                                                        clear();
                                                        await exec('manchester/assay-design', graph, genegraph_panel_layout)
                                                    })
                                                },

                                                {
                                                    'label': 'Gapmer Knockdown', 'ionfunction': createIonFunction(async () => {



                                                    })
                                                },
                                                {
                                                    'label': 'siRNA', 'ionfunction': createIonFunction(async () => {


                                                    })
                                                },
                                                {
                                                    'label': 'Splicing', 'ionfunction': createIonFunction(async () => {


                                                    })
                                                }
                                                    ,
                                                {
                                                    'label': 'Protein', 'ionfunction': createIonFunction(async () => {


                                                    })
                                                },
                                                ]
                                            },

                                            {
                                                'label': 'Graph', 'items': file_items
                                            },
                                            exptracks,
                                            {
                                                'label': 'Tools', 'icon': 'more_vert', 'items': tools_menu
                                            },
                                            {
                                                'label': 'Data', 'items': data_menu
                                            },
                                            {
                                                'label': 'Select', 'items': [
                                                    {
                                                        'label': 'Tracks', 'ionfunction': createIonFunction(async () => {
                                                            await exec('baja/manchester/menu/select-tracks-sub-menu.js', graph, genegraph_panel_layout)

                                                            graph.clearMouseListeners();
                                                            graph.addMouseMoveListener((x, y) => {
                                                                graph.deselectAllTracks()

                                                                let trackIndex = graph.getTrack(x, y);
                                                                if (trackIndex >= 0) {
                                                                    let selectedTrack = graph.track[trackIndex]
                                                                    if (selectedTrack)
                                                                        selectedTrack.select();
                                                                }

                                                            })
                                                            graph.addMouseDownListener((x, y) => {
                                                                let trackIndex = graph.getTrack(x, y);
                                                                if (trackIndex >= 0) {
                                                                    let selectedTrack = graph.track[trackIndex]
                                                                    if (selectedTrack)
                                                                        selectedTrack.select();

                                                                    graph.clearMouseListeners();
                                                                    graph.setMouseMode('navigate')

                                                                }

                                                            })
                                                        })
                                                    },
                                                    {
                                                        'label': 'Sequence', 'ionfunction': createIonFunction(async () => {
                                                            graph.setMessage(" Select a sequence on a track.")
                                                            await exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout, true)
                                                        })
                                                    },
                                                    {
                                                        label: 'Track + Sequence',
                                                        'ionfunction': createIonFunction(async () => {
                                                            graph.deselectAllTracks()
                                                            graph.addMouseDownListener(async (x, y) => {
                                                                let trackIndex = graph.getTrack(x, y)
                                                                if (trackIndex >= 0) {
                                                                    let ttrack = graph.track[trackIndex]
                                                                    if (ttrack) {
                                                                        let track = ttrack;
                                                                        track.select();
                                                                        track.markstart = track.tgraph.xmin;
                                                                        track.markend = track.tgraph.xmax;

                                                                        // The whole track sequence is now selected; stop
                                                                        // listening so the popup menu isn't re-triggered.
                                                                        graph.clearMouseListeners();
                                                                        graph.setMouseMode('navigate');

                                                                        // Treat the selected track as the working track and
                                                                        // the marked range as the annotation for the tools.
                                                                        const selectedTrack = track;
                                                                        const annotation = {
                                                                            xi: track.markstart,
                                                                            xf: track.markend,
                                                                            name: track.name
                                                                        };

                                                                        const models = [
                                                                            {
                                                                                label: 'LJSplice v2',
                                                                                click: async (xwc, ywc) => {
                                                                                    if (!selectedTrack) {
                                                                                        graph.setMessage(" No track selected ");
                                                                                        return;
                                                                                    }
                                                                                    graph.setMouseMode('none');
                                                                                    graph.setMessage("Click on a track to plot attributes");
                                                                                    await exec('baja/bio/splicing/splicing-on-exon.js', graph, selectedTrack, annotation);
                                                                                },
                                                                                move: () => log('')
                                                                            },

                                                                            {
                                                                                label: 'Phylon',

                                                                                click: async (xwc, ywc) => {
                                                                                    async function runCrypticExonFinder({ graph, selectedTrack, annotation, exec, infoPrompt, scriptPath }) {
                                                                                        if (!selectedTrack) {
                                                                                            graph.setMessage(" No track selected ");
                                                                                            return;
                                                                                        }

                                                                                        graph.showSideMenu(null);

                                                                                        const xi = annotation.xi - 4;
                                                                                        const xf = annotation.xf + 4;

                                                                                        const r = await exec(
                                                                                            scriptPath,
                                                                                            selectedTrack.getSequenceRange(xi, xf),
                                                                                            selectedTrack.chr,
                                                                                            xi,
                                                                                            xf,
                                                                                            selectedTrack.strand
                                                                                        );

                                                                                        const cryptic_exons = await exec('baja/bio/splicing/cryptic-exons');
                                                                                        const g = cryptic_exons.generateCrypticExons(r, { xiAnchor: xi });

                                                                                        for (let cry of g) selectedTrack.add(cry);

                                                                                        if (r && r.status === "file_downloading") {
                                                                                            infoPrompt("Model building; this only needs to happen once but may take several minutes");
                                                                                            return;
                                                                                        }
                                                                                    }

                                                                                    const submenu = [
                                                                                        {
                                                                                            label: 'Human',
                                                                                            click: async () => {
                                                                                                await runCrypticExonFinder({
                                                                                                    graph,
                                                                                                    selectedTrack,
                                                                                                    annotation,
                                                                                                    exec,
                                                                                                    infoPrompt,
                                                                                                    scriptPath: 'py/splicing/cryptic-exon-finder.py'
                                                                                                });
                                                                                            },
                                                                                            move: () => log('')
                                                                                        },
                                                                                        {
                                                                                            label: 'Mouse',
                                                                                            click: async () => {
                                                                                                await runCrypticExonFinder({
                                                                                                    graph,
                                                                                                    selectedTrack,
                                                                                                    annotation,
                                                                                                    exec,
                                                                                                    infoPrompt,
                                                                                                    scriptPath: 'py/splicing/cryptic-exon-finder-mm9.py'
                                                                                                });
                                                                                            },
                                                                                            move: () => log('')
                                                                                        }
                                                                                    ];

                                                                                    graph.showSideMenu(submenu);
                                                                                },
                                                                                move: () => log('')
                                                                            },

                                                                            {
                                                                                label: 'Secondary structure',
                                                                                click: async (xwc, ywc) => {
                                                                                    if (!selectedTrack) {
                                                                                        infoPrompt(" No track selected ");
                                                                                        return;
                                                                                    }

                                                                                    selectedTrack.markstart = annotation.xi;
                                                                                    selectedTrack.markend = annotation.xf;

                                                                                    let sequence = selectedTrack.getHighlightedSequence();
                                                                                    if (sequence.length > 7000) {
                                                                                        infoPrompt(" Sequence is too long for the prediction tool (>7kb)");
                                                                                        return;
                                                                                    }

                                                                                    let lb = null;
                                                                                    let engineMonitor = new EngineMonitor((msg) => {
                                                                                        lb.setHTML(msg);
                                                                                    });

                                                                                    CurrentLayout.setComponent('buttonMenuPanel', {
                                                                                        wid: 'html',
                                                                                        refCallback: createIon((p) => {
                                                                                            lb = p;
                                                                                        }),
                                                                                        data: '<font color="blue"> Generating secondary structure.... </font>'
                                                                                    });

                                                                                    let t = await selectedTrack.createSecondaryStructure(
                                                                                        selectedTrack.markstart,
                                                                                        selectedTrack.getHighlightedSequence(),
                                                                                        selectedTrack.name,
                                                                                        engineMonitor
                                                                                    );
                                                                                    t.anchorX = selectedTrack.markstart;
                                                                                    t.xindex_start = selectedTrack.markstart;
                                                                                    t.tgraph.yi = selectedTrack.tgraph.yi;
                                                                                    t.anchorY = selectedTrack.tgraph.yi;

                                                                                    setTimeout(async () => {
                                                                                        graph.showSideMenu(null);
                                                                                        graph.setCenterMessage(" Secondary structure is complete ");
                                                                                    }, 10000);
                                                                                },
                                                                                move: () => log('')
                                                                            }
                                                                        ];

                                                                        graph.showSideMenu(models);









                                                                    }
                                                                }
                                                            })
                                                        })
                                                    },

                                                    {
                                                        'label': 'Compounds', 'ionfunction': createIonFunction(async () => {
                                                            let select_panel = await exec('baja/manchester/menu/select-compounds-editor-menupanel.js', graph, genegraph_panel_layout)
                                                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                            CurrentLayout.setComponent('buttonMenuPanel', select_panel);
                                                            graph.setMessage('Click and drag a box around the group of compounds you want to edit.')
                                                            await exec('baja/manchester/select-compounds.js', graph, genegraph_panel_layout)

                                                        })
                                                    },
                                                    {
                                                        'label': 'Annotations', 'ionfunction': createIonFunction(async () => {
                                                            let select_panel = await exec('baja/manchester/menu/select-compounds-editor-panel.js', graph, genegraph_panel_layout)
                                                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                            CurrentLayout.setComponent('buttonMenuPanel', select_panel);

                                                        })
                                                    },

                                                    {
                                                        'label': 'Mutations', 'ionfunction': createIonFunction(async () => {
                                                            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                                                            let hl = await exec('baja/manchester/menu/variant-tools-finder.js', graph, genegraph_panel_layout)
                                                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                            CurrentLayout.setComponent('buttonMenuPanel', hl);

                                                            let highlightmethod = (ctx, graph) => {

                                                                let tracks = graph.track;
                                                                for (let selectedTrack of tracks) {
                                                                    let gwcxs = graph.Xwc(0);
                                                                    if (!gwcxs)
                                                                        return;
                                                                    let gwcxf = graph.Xwc(0 + graph.graph.grid.width);
                                                                    if (!gwcxf)
                                                                        return;
                                                                    let twcxs = selectedTrack.tgraph.Xwc(gwcxs - 2 * selectedTrack.tgraph.xi);
                                                                    let twcxf = selectedTrack.tgraph.Xwc(gwcxf - 2 * selectedTrack.tgraph.xi);
                                                                    let snpsv = selectedTrack.getVisibleSNPs(twcxs, twcxf);
                                                                    for (let s of snpsv) {
                                                                        ctx.strokeStyle = 'red';
                                                                        ctx.lineWidth = 6;

                                                                        let x = graph.X(selectedTrack.tgraph.X(s.xi))
                                                                        let y = graph.Y(selectedTrack.tgraph.Y(s.y))
                                                                        let w = 2;
                                                                        let h = 2;

                                                                        var kappa = .5522848,
                                                                            ox = (w / 2) * kappa,
                                                                            oy = (h / 2) * kappa,
                                                                            xe = x + w,
                                                                            ye = y + h,
                                                                            xm = x + w / 2,
                                                                            ym = y + h / 2;

                                                                        ctx.beginPath();
                                                                        ctx.moveTo(x, ym);
                                                                        ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
                                                                        ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
                                                                        ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
                                                                        ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);

                                                                        ctx.stroke();
                                                                    }

                                                                }
                                                            }

                                                            graph.highlightmethod = highlightmethod;
                                                            setTimeout(() => {

                                                                graph.highlightmethod = null;
                                                            }, 10000)

                                                        })

                                                    }

                                                ],
                                            }, {
                                                label: 'Bookmarks',
                                                items: [
                                                    {
                                                        label: 'Show/Hide Bookmarks', ionfunction: createIonFunction(async () => {
                                                            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                                                            graph.showBookmarkMenu();
                                                        })
                                                    }, {
                                                        label: 'Create Bookmark', ionfunction: createIonFunction(async () => {
                                                            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                                                            let m = await exec('baja/manchester/modal/label-bookmark.js', graph);
                                                            showModal(m);
                                                            graph.setMouseMode('navigate')

                                                            graph.showBookmarkMenu();
                                                        })
                                                    },
                                                ]
                                            }

                                        ]
                                    }
                                }
                            },
                            {
                                'width': '50%',
                                'height': 100,
                                'component': buttonMenuPanel
                            }], [
                            {
                                'width': '100%',
                                'height': '100%',
                                'component': geneGraph
                            }

                        ]]
                }
            }
            progressBar(100);
            graph.genegraph_panel_layout = genegraph_panel_layout;

            // Start the view-state history recorder: it samples the grid (zoom/pan) state and,
            // once a view has been stable for >2s, pushes it to a back/forward history stack
            // (see Navigate → History). Idempotent.
            try { exec('baja/manchester/menu/view-history.js', graph); } catch (e) { }

            // When the mainPanel is reset back to the editor canvas, re-arm the default
            // mouse-over-highlight mode. Patch CurrentLayout.reset once so this happens
            // wherever reset('mainPanel') is called.
            try {
                if (typeof CurrentLayout !== 'undefined' && CurrentLayout && CurrentLayout.reset && !CurrentLayout.__mohPatched) {
                    const __origReset = CurrentLayout.reset.bind(CurrentLayout);
                    CurrentLayout.reset = function (name) {
                        const r = __origReset(name);
                        if (('' + name).indexOf('mainPanel') >= 0) {
                            setTimeout(() => {
                                try {
                                    graph.clearMouseListeners();
                                    graph.setMouseMode('navigate');
                                    exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout);
                                } catch (e) { }
                            }, 60);
                        }
                        return r;
                    };
                    CurrentLayout.__mohPatched = true;
                }
            } catch (e) { }

            let main_layout = {
                wid: 'card',
                height: '100%',
                componentRef: 'mainPanel',
                data: {
                    cards: [
                        [

                            {
                                'width': '100%',
                                'height': '100%',
                                'component': genegraph_panel_layout
                            }
                        ]]
                }
            }
            clear();
            showWidget(
                main_layout
            );
            working.status = 'complete'

            CurrentLayout.stash('mainPanel', main_layout)

            // Show the installed news as a newspaper overlay at startup (click / auto-dismiss),
            // keeping full screen space for the graph.
            try {
                if (__newsMsgs && __newsMsgs.length) {
                    setTimeout(() => { try { __showNewspaper(__newsMsgs); } catch (e) { } }, 600);
                }
            } catch (e) { }

            if (window['env']['auth'] === 'b2c') {
                var result = await verifyUserPath('manchester/editor', 'bajabio-Designer');
                if (!result.allowed) {
                    await exec('baja/datayak/ljlcheckout.js', result)
                    return;
                }
            }

            let m = window['env']['theme']
            if (!m) {
                m = 'bajabio'
            }
            graph.setMessageCenter(m, 40)

            setTimeout(() => {
                graph.isPreviousState().then(r => {
                    if (r) {
                    }
                })


            }, 5000)

            if (config && config.ensemblList != null) {
                for (let ensembl of ensemblList)
                    graph.add(ensembl)
            }

        })

    })

    })();

}
