function (path, config) {

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
        } else
            return exec('baja/nogo.js')
    }
    showWidget({
        wid: 'html',
        data: '<hr> Loading... '
    }).then(async working => {

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

        if (path && path.length > 0) {
            setTimeout(() => {
                window.history.pushState({}, '', (`/app/baja/train-tracks?path=${path}`));
            }, 7000)
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
            window.addEventListener('keydown', async function (event) {
                if (event.ctrlKey && event.key === 'z') {
                    let p = await popHistory();
                    if (p != null) {

                        await graph.update(p);
                    }
                }
            });
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
                                                console.log('debubg');
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
                'label': 'New...', 'ionfunction': createIonFunction(() => {
                    exec('baja/manchester/add-track.js', graph)
                })
            })

            track_items.push({
                'label': 'Track from sequence', 'ionfunction': createIonFunction(() => {
                    exec('baja/manchester/new-track.js', graph, genegraph_panel_layout)
                })
            })

            track_items.push({
                'label': 'Paste...', 'ionfunction': createIonFunction(async () => {
                    await exec('manchester/controls/paste-panel.js', graph, genegraph_panel_layout, eeditor_state)
                })
            })

            track_items.push({

                'label': 'Select Sequence', 'ionfunction': createIonFunction(async () => {

                    await exec('baja/manchester/menu/sequence-tt.js', graph, genegraph_panel_layout, true)
                    await exec('baja/manchester/menu/annotation/annotation-tools2.js', graph, genegraph_panel_layout)

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
                'label': 'Tracks', 'items': track_items
            }

            let geneGraph = await graph.createComponent();
            let button_canvas = await exec('manchester/controls/navigation-panel-tt.js', graph)
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

            let htmlP;
            let htmlT = ''

            if (htmlT) {
                htmlT = JSON.stringify(htmlT)
            } else {
                htmlT = ''
            }

            let refChem = createIonFunction((d) => {
                htmlP = d
            })

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
                                                    'title': '',
                                                    'component': button_canvas
                                                },
                                            ]]
                                    }
                                }
                            },
                            {
                                'component': {
                                    wid: 'html',
                                    componentRef: 'labelPanel',
                                    refCallback: refChem,
                                    data: htmlT
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

            let saveSaveScreen = async () => {
                let savedScreens = await exec('manchester/io/save-obj-tt.js', graph, genegraph_panel_layout, path)
                showModal(savedScreens);
            }
            let openSaveScreen = async () => {
                let savedScreens = await exec('manchester/io/open-obj-tt.js', graph, genegraph_panel_layout)
                showModal(savedScreens);
            }

            let tools_menu = []
            tools_menu = [

                {
                    'label': 'Navigation', 'ionfunction': createIonFunction(async () => {

                        let button_canvas_ = await exec('manchester/controls/navigation-panel-tt.js', graph, genegraph_panel_layout)
                        CurrentLayout.clearComponent('buttonMenuPanel,labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', button_canvas_);
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
                        await exec('baja/manchester/menu/sequence-tt.js', graph, genegraph_panel_layout, true)
                        await exec('baja/manchester/menu/annotation/annotation-tools2.js', graph, genegraph_panel_layout)
                    })
                },
                {
                    'label': 'Sequence', 'ionfunction': createIonFunction(async () => {
                        graph.showWindowMenu(await exec('baja/manchester/menu/load-seq-tools-menu-tt', graph, genegraph_panel_layout), 10, 10, 400)
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

            ]

            progressBar(80);

            let data_menu = []
            let data_items = window['env']['data']
            for (let d of data_items) {
                data_menu.push({
                    'label': d.label, 'ionfunction': createIonFunction(async () => {
                        graph.clearMouseListeners();
                        graph.setMouseMode('navigate')
                        await exec(d.script, d.data, d.server, graph, genegraph_panel_layout)
                    })
                })
            }

            let train_items = [
                {
                    'label': 'New model', 'ionfunction': createIonFunction(async () => {
                        let menu = await exec('baja/ml/training-set-new-menu.js', graph, genegraph_panel_layout);
                        graph.showWindowMenu(menu, 10, 10, 400)
                    })
                },
                {
                    'label': 'Annotation models', 'ionfunction': createIonFunction(async () => {
                        exec('baja/ml/training-set-menu.js', graph, genegraph_panel_layout);
                    })
                },
                {
                    'label': 'PCA on track layer', 'ionfunction': createIonFunction(async () => {
                        exec('baja/manchester/menu/interval-layers.js', graph, genegraph_panel_layout);
                    })
                },
                {
                    'label': 'Find sequence features... ', 'ionfunction': createIonFunction(async () => {
                        exec('baja/manchester/menu/polygon-layers.js', graph, genegraph_panel_layout);
                    })
                }
            ]

            let file_items = []

            if (user != null && user.length > 0) {
                file_items.push({
                    'label': 'Open workbench', 'ionfunction': createIonFunction(openSaveScreen)
                })
                file_items.push({
                    'label': 'Save workbench', 'ionfunction': createIonFunction(saveSaveScreen)
                })
                file_items.push({
                    'label': 'Copy workbench', 'ionfunction': createIonFunction(async () => {
                        graph.setMessage(" Copy graph... ")
                        let v = await graph.getState();
                        navigator.clipboard.writeText(v);
                    })
                })
                file_items.push({
                    'label': 'Download SVG', 'ionfunction': createIonFunction(() => {
                        graph.setMessage(" Generating SVG... ")
                        graph.saveToSVG();
                    })
                })
            }

            file_items.push(
                {
                    'label': 'Import...', 'ionfunction': createIonFunction(async () => {
                        await exec('manchester/controls/paste-panel.js', graph, genegraph_panel_layout, eeditor_state)
                    })

                },
            ),
            {
                'label': 'Layers', 'ionfunction': createIonFunction(async () => {
                    graph.setMessage(" Select a track to edit layers.")
                    let hl = await exec('baja/manchester/menu/select-track-action-layers.js', graph, genegraph_panel_layout);

                })
            }

            let ops_items = []

            if (user != null && user.length > 0) {
                ops_items.push({
                    'label': 'Track functions', 'ionfunction': createIonFunction(async () => {
                        let data_items = window['env']['data']
                        let functions = []
                        for (let d of data_items) {
                            if (d.data.toLowerCase().endsWith('rnaseq')) {
                                functions.push(d)
                            }
                        }
                        graph.showWindowMenu(await exec('baja/manchester/menu/track-functions', functions, graph, genegraph_panel_layout), 10, 10, 400)
                    })
                })
                ops_items.push({
                    'label': 'Track training', 'ionfunction': createIonFunction()
                })
            }

            file_items.push(
                {
                    'label': 'Import...', 'ionfunction': createIonFunction(async () => {
                        await exec('manchester/controls/paste-panel.js', graph, genegraph_panel_layout, eeditor_state)
                    })

                },
            ),
            {
                'label': 'Layers', 'ionfunction': createIonFunction(async () => {
                    graph.setMessage(" Select a track to edit layers.")
                    let hl = await exec('baja/manchester/menu/select-track-action-layers.js', graph, genegraph_panel_layout);

                })
            }

            graph.autosave = true;

            genegraph_panel_layout = {
                wid: 'card',
                componentRef: 'geneGraphPanel',
                data: {
                    cards: [
                        [

                            {
                                'width': '100%',
                                'component': {
                                    wid: 'menu',
                                    data: {
                                        menus: [

                                            {
                                                'label': 'File', 'items': file_items
                                            },
                                            {
                                                'label': 'Ops', 'items': ops_items
                                            },
                                            {
                                                'label': 'Train', 'items': train_items
                                            },
                                            exptracks,
                                            {
                                                'label': 'Tools', 'icon': 'more_vert', 'items': tools_menu
                                            },
                                            {
                                                'label': 'Data', 'items': data_menu
                                            },

                                        ]
                                    }
                                }
                            },
                            {
                                'width': '100%',
                                'component': buttonMenuPanel
                            },
                            {
                                'width': '100%',
                                'component': geneGraph
                            }

                        ]]
                }
            }
            progressBar(100);
            graph.genegraph_panel_layout = genegraph_panel_layout;

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

            let m = window['env']['theme']
            if (!m) {
                m = 'bajabio'
            }
            graph.setMessageCenter(m, 120)

            setTimeout(() => {
                graph.isPreviousState().then(r => {
                    if (r) {
                        graph.setMessage(" Previous state file was found. ")
                    }
                })

            }, 5000)

            if (config && config.ensemblList != null) {
                for (let ensembl of ensemblList)
                    graph.add(ensembl)
            }

        })

    })

}
