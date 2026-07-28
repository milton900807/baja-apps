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

    let htmlP;

    let user = getUser();

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

        let HM = await exec('baja/history/HM')
        let AnimateGrid = await exec('flexigraph/animate-it.js')
        let PlateTrack = await exec('baja/plate/plate-track.js')
        let MGrid = await exec('flexigraph/grid.js')
        let Plate = await exec('baja/plate/plate.js');
        let GenericWell = await exec('baja/plate/well.js')
        let current_mousex
        let current_mousey
        let mouseUpListener;
        let mouseDownListener;
        let draw;
        let currentShape = {
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            visible: false
        };

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

        let PlateManager = class PlateManager {
            plateTrack;

            constructor() {
                this.plateTrack = new PlateTrack(path);
                this.plateTrack.init();
            }
            getPlateTrack() {
                return this.plateTrack;
            }
            updateEvents() {
                let e = LJScript.getEvents();
                if (e && e.length > 1 && htmlP) {
                    htmlP.setHTML(` <font color="blue">${e[e.length - 1]}</font>`)
                }
            }
            setPlateTrack(plateTrack) {
                this.plateTrack = plateTrack;

            }
        }
        let pm = new PlateManager()

        exec('flexigraph/gene2plates.js', pm, progressBar).then(async (graph) => {
            cacheOn()
            let io;
            let tracks;
            let genegraph_panel_layout;

            let { Track, TrackRef } = await exec('baja/bio/track.js')
            if (path.endsWith('.bjb')) {
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

                    if (rs.plateTrack)
                        rs.plateTrack.file = path;

                    let p = decodeURIComponent(path).substring(index + 1)
                    window.history.pushState({ 'rna-screen': path }, 'yak', `/app/baja/pub/yak52?path=${path}`);
                    if (rs.msg) {
                        clear();
                        log(rs.msg + ' ' + p)
                        return;
                    } else {

                        if (rs && rs.ptracks && rs.formulas) {

                            pm.plateTrack.copyFromJSON(rs)
                            graph.file = p;
                        }

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

            function handleShiftClick(event) {

                if (event.shiftKey && event.type === 'mousedown') {
                    console.log('Shift + Click detected');
                    if (pm.plateTrack && pm.plateTrack.selectedPlate) {
                        pm.plateTrack.selectedPlate.selectContiguousRange();
                    }
                }
            }
            function attachShiftClickListener(element = document) {
                element.addEventListener('mousedown', handleShiftClick);
            }
            attachShiftClickListener();

            window.addEventListener('keydown', async function (event) {
                if (event.ctrlKey && event.key === 'z') {
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

            document.addEventListener('keydown', async (event) => {

                if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
                    event.preventDefault();
                    await handleUndo();
                }
                if ((event.ctrlKey) && event.key === 'Z') {
                    event.preventDefault();
                    handleRedo();
                }
                if (event.key === 'Tab') {
                    event.preventDefault();
                }
            });
            function findObjectWithUid(objects, uidValue) {
                function scan(obj) {
                    if (obj && typeof obj === 'object') {

                        if ('uid' in obj && obj.uid === uidValue) {
                            return obj;
                        }
                        for (let key in obj) {
                            if (obj.hasOwnProperty(key)) {
                                let result = scan(obj[key]);
                                if (result) {
                                    return result;
                                }
                            }
                        }
                    }
                    return null;
                }

                if (Array.isArray(objects)) {
                    for (let item of objects) {
                        let result = scan(item);
                        if (result) {
                            return result;
                        }
                    }
                } else {

                    return scan(objects);
                }

                return null;
            }

            function reconstituteObject(originalObject, jsonObject) {
                for (let key in jsonObject) {
                    if (jsonObject.hasOwnProperty(key)) {
                        const originalValue = originalObject[key];
                        const jsonValue = jsonObject[key];

                        if (jsonValue === null || typeof jsonValue !== 'object') {
                            if (originalValue !== jsonValue) {
                                originalObject[key] = jsonValue;
                            }
                        } else if (typeof jsonValue === 'object' && originalValue && typeof originalValue === 'object') {
                            if (key === 'grid' && originalValue instanceof MGrid) {

                                Object.assign(originalValue, jsonValue);
                            } else if (key === 'wells' && Array.isArray(jsonValue)) {

                                for (let col = 0; col < jsonValue.length; col++) {
                                    if (!originalValue[col]) {
                                        originalValue[col] = [];
                                    }

                                    for (let row = 0; row < jsonValue[col].length; row++) {
                                        const jsonWell = jsonValue[col][row];
                                        if (originalValue[col][row] instanceof GenericWell) {
                                            Object.assign(originalValue[col][row], jsonWell);
                                        } else {
                                            originalValue[col][row] = new GenericWell(
                                                jsonWell.name,
                                                jsonWell.value,
                                                jsonWell.obj,
                                                jsonWell.group
                                            );
                                            Object.assign(originalValue[col][row], jsonWell);
                                        }
                                    }

                                    if (originalValue[col].length > jsonValue[col].length) {
                                        originalValue[col].length = jsonValue[col].length;
                                    }
                                }

                                if (originalValue.length > jsonValue.length) {
                                    originalValue.length = jsonValue.length;
                                }
                            } else {
                                reconstituteObject(originalValue, jsonValue);
                            }
                        }
                    }
                }
            }

            let redo = []
            let handleUndo = async () => {
                let gs;
                gs = await popHistory()

                console.log('debubg');

                if (!gs) {
                    return;
                }

                if (gs.root) {
                    graph.updatePlateTracks(gs)
                } else {

                    if (pm.plateTrack && pm.plateTrack.selectedTrack)
                        pm.plateTrack.selectedTrack.pushAnyPreviousHistory()
                    if (gs.uid) {
                        let ob = findObjectWithUid([pm], gs.uid)
                        if (ob) {
                            redo.push(HM(ob))
                            reconstituteObject(ob, gs)
                        }
                    }
                }
            }

            let handleRedo = () => {
                if (redo.length > 0) {
                    let gs = JSON.parse(redo.pop());
                    if (gs.root) {
                        graph.updatePlateTracks(gs)
                    } else {
                        if (gs.uid) {
                            let ob = findObjectWithUid([pm], gs.uid)
                            if (ob) {
                                pushHistory(HM(ob))
                                reconstituteObject(ob, gs)
                            }
                        }
                    }

                }
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
                                            let MutationParser = await exec('baja/screens/menu/annotation/mutation-parser.js');
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
                    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
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

            let smenu = null;
            let setMenu = async (__smenu) => {
                if (!smenu) {
                    return;
                }
                currentWorkbench = null;
                smenu = __smenu;
                mousePriority = false;
                mouseDownListener = (x, y) => {
                };
                mouseMoveListener = (x, y) => {
                    if (!smenu) {
                        console.log(" no menu ")
                    }
                    let mmx = pm.plateTrack.grid.Xwc(x);
                    let mmy = pm.plateTrack.grid.Ywc(y);
                    if (smenu && smenu.isIn(pm.plateTrack.grid, mmx, mmy)) {
                        smenu.mouseMove(pm.plateTrack.grid, mmx, mmy)
                    }
                }
                mouseUpListener = async (x, y) => {
                    let mmx = pm.plateTrack.grid.Xwc(x);
                    let mmy = pm.plateTrack.grid.Ywc(y);
                    if (smenu && smenu.isIn(pm.plateTrack.grid, mmx, mmy)) {
                        await smenu.mouseUp(pm.plateTrack.grid, mmx, mmy)

                    }
                }
            }

            let zoomin = async () => {
                AnimateGrid.INTERUPT = true;
                pm.plateTrack.grid.rescale();
                smenu = null;
                mousePriority = false;
                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;
                let xdf = Math.abs((xmax - xmin) / 7);
                let ydf = Math.abs((ymax - ymin) / 7);
                ymax -= ydf;
                ymin += ydf;
                xmax -= xdf;
                xmin += xdf;
                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);
                pm.plateTrack.grid.rescale();
            }

            let zoomout = async () => {
                AnimateGrid.INTERUPT = true;

                pm.plateTrack.grid.rescale();
                smenu = null;
                mousePriority = false;

                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;
                let xdf = Math.abs((xmax - xmin) / 2);
                let ydf = Math.abs((ymax - ymin) / 2);

                ymax += ydf;
                ymin -= ydf;
                xmax += xdf;
                xmin -= xdf;
                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);
                pm.plateTrack.grid.rescale();
            }

            let shiftLeft = async (left_distance) => {
                AnimateGrid.INTERUPT = true;
                pm.plateTrack.grid.rescale();
                smenu = null;
                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;

                xmin -= left_distance;
                xmax -= left_distance;

                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);

                pm.plateTrack.grid.rescale();
            }

            let shiftDown = async (left_distance) => {
                pm.plateTrack.grid.rescale();
                smenu = null;

                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;

                ymin -= left_distance;
                ymax -= left_distance;

                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);

                pm.plateTrack.grid.rescale();
            }

            let shiftUp = async (left_distance) => {
                AnimateGrid.INTERUPT = true;

                pm.plateTrack.grid.rescale();
                smenu = null;

                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;

                ymin += left_distance;
                ymax += left_distance;

                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);

                pm.plateTrack.grid.rescale();
            }

            let shiftRight = async (left_distance) => {
                AnimateGrid.INTERUPT = true;

                pm.plateTrack.grid.rescale();
                smenu = null;

                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;

                xmin += left_distance;
                xmax += left_distance;

                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);

                pm.plateTrack.grid.rescale();
            }

            let zoomtofitplates = () => {
                AnimateGrid.INTERUPT = true;
                pm.plateTrack.zoomtfit()
            }
            let px = 0;
            let py = 0;
            let dragnavigate = () => {
                draw = null;
                menuManager = null;
                smenu = null;
                currentWorkbench = null;
                smenu = null;
                mouseMoveListener = null;
                mouseUpListener = null;
                mouseDownListener = null;
                draw = null;
                menuManager = null;
                keydown = null;
                px = 0;
                px = 0;

                let t = {
                    id: 'drag-navigate' + Math.random(),
                    priority: true,
                    mouseUpListener: (x, y) => {
                        px = 0;
                        py = 0;
                        md = false;

                    },
                    mouseDownListener: (scx, scy) => {
                        md = true;

                    },
                    mouseMoveListener: (scx, scy) => {

                        if (smenu) {
                            return;
                        }

                        if (md) {
                            if (px === 0) {
                                px = pm.plateTrack.grid.Xwc(scx);
                                py = pm.plateTrack.grid.Ywc(scy);
                            }
                            else {
                                let xd = px - pm.plateTrack.grid.Xwc(scx);
                                let yd = py - pm.plateTrack.grid.Ywc(scy);
                                pm.plateTrack.grid.setxmin(pm.plateTrack.grid.getxmin() + xd);
                                pm.plateTrack.grid.setymin(pm.plateTrack.grid.getymin() + yd);
                                pm.plateTrack.grid.setxmax(pm.plateTrack.grid.getxmax() + xd);
                                pm.plateTrack.grid.setymax(pm.plateTrack.grid.getymax() + yd);
                                pm.plateTrack.grid.rescale();
                            }
                        } else {

                            let new_selected = pm.plateTrack.getPlate(pm.plateTrack.grid.Xwc(scx), pm.plateTrack.grid.Ywc(scy))
                            if (new_selected) {
                                if (new_selected != pm.plateTrack.grid.selectedPlate || !pm.plateTrack.selectedPlate) {
                                    pm.plateTrack.setSelected(new_selected);
                                    pm.plateTrack.grid.selectedPlate.last_touched = new Date();
                                    pm.plateTrack.grid.selectedPlate.selectIt(pm.plateTrack.grid);
                                }
                            } else {
                                pm.plateTrack.setSelected(null);
                            }

                        }
                    }
                }
                wb(t)
            }

            let currentWorkbench = null;
            let wb = (wbset) => {
                if (!wbset) {

                    if (currentWorkbench != null && currentWorkbench.close) {
                        currentWorkbench.close();
                    }
                    currentWorkbench = null;
                    smenu = null;
                    mouseMoveListener = null;
                    mouseUpListener = null;
                    mouseDownListener = null;
                    draw = null;
                    menuManager = null;
                    keydown = null;

                    dragnavigate();

                    return;
                } else {
                    if (currentWorkbench && currentWorkbench.id && currentWorkbench.id === wbset.id) {
                        return;

                    } else {
                        if (currentWorkbench != null && currentWorkbench.close) {
                            currentWorkbench.close();
                        }
                        currentWorkbench = wbset;
                        pm.plateTrack.wbid = currentWorkbench.id;
                    }
                    if (wbset.buttons) {
                        panel.setButtons(wbset.buttons)
                    }
                    if (wbset.msg) {
                        message = wbset.msg;
                        setTimeout(() => {
                            message = null;

                        }, 5000)
                    }
                    smenu = wbset.smenu;
                    mouseMoveListener = wbset.mouseMoveListener;
                    mouseUpListener = wbset.mouseUpListener;
                    mouseDownListener = wbset.mouseDownListener;
                    draw = wbset.draw;
                    menuManager = wbset.menuManager;

                    if (wbset.init) {
                        wbset.init(current_mousex, current_mousey, pm);
                    }

                }
            }

            let default_dbclick = (scx, scy) => {

            }

            let default_wheel = (dy) => {

            }

            let resize_plate_width = (plate, scx, scy) => {
                let xi = scx;
                let yi = scy;
                let origWidth = pm.plateTrack.grid.screenWidth(plate.grid.width);
                let diffx = 0
                let t = {
                    id: 'resize-width',
                    priority: true,
                    mouseDownListener: (async (x, y) => {
                        md = true;
                        xi = x;
                        if (pm.plateTrack && plate && plate.grid) {
                            yi = y + pm.plateTrack.grid.Y(plate.grid.yi);
                            plate.__resizing = true;
                            pm.plateTrack.grid.rescale();
                            origWidth = pm.plateTrack.grid.screenWidth(plate.grid.width);
                        }
                    }),
                    mouseMoveListener: ((x, y) => {
                        pm.plateTrack.grid.rescale()
                        if (md) {
                            diffx = x - xi
                            let sw = (origWidth + diffx);
                            if (sw < 10) {
                                sw = 10;
                            }
                            plate.__resizing = true;
                            let gw = pm.plateTrack.grid.worldWidth(sw);
                            plate.grid.width = gw;
                            plate.grid.rescale();
                        }
                        else if (!pm.plateTrack.selectedPlate.onRightEdge(x, y, pm.plateTrack)) {
                            plate.__resizing = false;
                            plate.resizable = false;
                            plate.clk_drag(pm.plateTrack)
                        }

                    }),
                    mouseUpListener: ((x, y) => {
                        if (plate) {
                            plate.__resizing = false;
                            plate.resizable = false;
                            plate.clk_drag(pm.plateTrack)
                        }
                    })
                }
                wb(t)
            }

            let resize_plate = (plate, scx, scy) => {

                let xi = scx;
                let yi = scy;
                let origWidth = pm.plateTrack.grid.screenWidth(plate.grid.width);
                let origHeight = pm.plateTrack.grid.screenHeight(plate.grid.height);
                md = true;
                let t = {
                    id: 'resize',
                    priority: true,
                    mouseDownListener: (async (x, y) => {
                        md = true;
                        xi = x;
                        if (pm.plateTrack && plate && plate.grid) {
                            pm.plateTrack.grid.rescale();
                            plate.grid.rescale();
                            plate.__resizing = true;
                            origWidth = pm.plateTrack.grid.screenWidth(plate.grid.width);
                            origHeight = pm.plateTrack.grid.screenHeight(plate.grid.height);
                            originyi = plate.grid.yi;
                        }
                    }),
                    mouseMoveListener: ((x, y) => {
                        pm.plateTrack.grid.rescale();

                        if (md) {
                            plate.__resizing = true;

                            const diffx = x - xi;
                            const diffy = (y - yi);

                            let sw = origWidth + diffx;
                            let sh = origHeight + diffy;

                            if (sw < 0 || sh < 0) {
                                sw = origWidth;
                                sh = origHeight;
                            } else {

                                if (sw < 10) sw = 10;
                                if (sh < 10) sh = 10;
                            }

                            const gw = (pm.plateTrack.grid.worldWidth(sw));
                            const gh = (pm.plateTrack.grid.worldHeight(sh));

                            if (plate.setWidth) {
                                plate.setWidth(gw);
                            } else {
                                plate.grid.width = gw;
                            }

                            if (plate.setHeight) {
                                plate.setHeight(gh);
                            } else {
                                plate.grid.height = gh;
                            }
                            plate.grid.yi = pm.plateTrack.grid.Ywc(y);

                            plate.grid.rescale();
                        }

                    }),

                    mouseUpListener: ((x, y) => {
                        md = false;
                        this.md = false;
                        pm.plateTrack.deselectAll();
                        plate.__resizing = false;
                        plate.resizable = false;
                        plate.__resizing = false;
                        pm.plateTrack.wb(null)
                    })
                }
                wb(t)
            }

            let resize_plot = (plot, scx, scy) => {
                plot.highlight();
                plot.resizing = true;
                let xi = scx;
                let yi = scy;
                md = true;

                let origWidth = pm.plateTrack.grid.screenWidth(plot.w);
                let origHeight = pm.plateTrack.grid.screenHeight(plot.h);
                let diffx = 0
                let diffy = 0
                let t = {
                    id: 'resize_plot',
                    mouseDownListener: (async (x, y) => {
                        md = true;
                        xi = x;
                        yi = y;
                        pm.plateTrack.grid.rescale();
                        plot.grid.rescale();
                        origWidth = pm.plateTrack.grid.screenWidth(plot.w);
                        origHeight = pm.plateTrack.grid.screenHeight(plot.h);
                    }),
                    mouseMoveListener: ((x, y) => {
                        pm.plateTrack.grid.rescale()
                        if (md) {
                            diffx = x - xi;
                            diffy = y - yi;

                            plot.w = Math.abs(pm.plateTrack.grid.worldWidth((origWidth + (diffx))))
                            plot.h = Math.abs(pm.plateTrack.grid.worldHeight((origHeight + (diffy))))
                        }
                    }),
                    mouseUpListener: ((x, y) => {
                        setTimeout(() => {
                            wb(null)
                        }, 199);
                    })
                }
                wb(t)
            }

            let default_mousedownListener = async (scx, scy) => {
                AnimateGrid.INTERUPT = true;
                md = true;
                if (pm.plateTrack.isTextActive()) {
                    pm.plateTrack.setTextActive(false);
                    return;
                }

                if (smenu) {
                    return;
                }

                let mmx = pm.plateTrack.grid.Xwc(scx);
                let mmy = pm.plateTrack.grid.Ywc(scy);
                if (smenu && !smenu.isIn(pm.plateTrack.grid, mmx, mmy)) {
                    if (smenu && smenu.close)
                        smenu.close();
                    smenu = null;
                    pm.plateTrack.wb(null)
                    return;
                }

                if (pm.plateTrack.__redo_stack_menu && pm.plateTrack.__redo_stack_menu.mouseUp && pm.plateTrack.__redo_stack_menu.isIn(pm.plateTrack.grid,
                    pm.plateTrack.grid.Xwc(scx), pm.plateTrack.grid.Ywc(scy))) {
                    this.__redo_stack_menu.mouseUp(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                    return;

                }
                if (pm.plateTrack.attr__showTablesMenu) {

                    if (pm.plateTrack.__tables_menu && pm.plateTrack.__tables_menu.mouseUp &&
                        pm.plateTrack.__tables_menu.isIn(pm.plateTrack.grid, pm.plateTrack.grid.Xwc(scx), pm.plateTrack.grid.Ywc(scy))) {
                        pm.plateTrack.__tables_menu.mouseUp(pm.plateTrack.grid, pm.plateTrack.grid.Xwc(scx), pm.plateTrack.grid.Ywc(scy))
                        return;
                    }
                }

                let plate_selected = pm.plateTrack.selectedPlate;

                if (!smenu && pm.plateTrack) {
                    await pm.plateTrack.mouseDown(scx, scy)
                }
                if (plate_selected && plate_selected.handleMouseDown && !pm.plateTrack.IsInTableMenu(scx, scy)) {
                    await plate_selected.handleMouseDown(scx, scy, pm.plateTrack)
                }
                if (!pm.plateTrack.hasModalMenusOpen()) {
                    if (plate_selected && plate_selected.inResize && plate_selected.inResize(scx, scy, pm.plateTrack)) {
                        if (plate_selected.typeof && plate_selected.typeof === 'plot') {
                            return resize_plot(plate_selected, scx, scy)
                        } else {
                            return resize_plate(plate_selected, scx, scy);
                        }
                    }

                    if (plate_selected && plate_selected.onRightEdge && plate_selected.onRightEdge(scx, scy, pm.plateTrack)) {
                        return resize_plate_width(plate_selected, scx, scy);
                    }
                }

                if (mouseDownListener) {
                    mouseDownListener(scx, scy)
                }

                md = true;
            }

            let default_mouseUpListener = async (scx, scy) => {

                px = 0;
                py = 0;
                md = false;
                if (!smenu && pm.plateTrack) {
                    pm.plateTrack.mouseUp(scx, scy)
                }
                let plate_selected = pm.plateTrack.selectedPlate;

                if (plate_selected && plate_selected.__resizing) {
                    plate_selected.__resizing = false;
                }
                md = false;
                if (mouseUpListener && !pm.plateTrack.IsInTableMenu(scx, scy)) {
                    await mouseUpListener(scx, scy)
                }

            }

            let getPlate = (x, y) => {
                return pm.plateTrack.getPlate(x, y)
            }

            let getObject = (scx, scy) => {
                let mmx = scx;
                let mmy = scy;

                let p = getPlate(mmx, mmy);
                if (p != null) {
                    return p;
                }
                for (let connection of pm.plateTrack.connections) {
                    if (connection.isOnCircle((scx), (scy), pm.plateTrack.grid)) {
                        if (connection != null) {
                            return connection;
                        }
                    } else if (connection.isOnTriangle(scx, scy, pm.plateTrack.grid)) {
                        if (connection != null) {
                            return connection;
                        }
                    }
                }
                let l = getPlot(mmx, mmy)
                if (l != null) {
                    return l;

                }
                return null;
            }

            let hold_key_nav = true;

            let default_keydownListener = async (event) => {

                if (event.key === 'ArrowLeft') {
                    pm.plateTrack.navigate('left')
                } else if (event.key === 'ArrowRight') {
                    pm.plateTrack.navigate('right')
                } else if (event.key === 'ArrowDown') {
                    console.log("ymax before: " + pm.plateTrack.grid.ymax);
                    pm.plateTrack.navigate('down')
                    console.log('Down arrow pressed, scale adjusted');
                } else if (event.key === 'ArrowUp') {
                    console.log("ymax before: " + pm.plateTrack.grid.ymax);
                    pm.plateTrack.navigate('up')
                    console.log('Down arrow pressed, scale adjusted');
                }

                if (currentWorkbench && currentWorkbench.keydown) {
                    return currentWorkbench.keydown(event)
                }

                let plate_selected = pm.plateTrack.selectedPlate;
                if (plate_selected && plate_selected.handleKeyDown) {
                    plate_selected.handleKeyDown(pm.plateTrack, event)
                }
            }

            let default_mousemoveListener = async (scx, scy) => {
                if (pm.plateTrack.isTextActive()) {
                    return null
                }
                current_mousex = scx;
                current_mousey = scy;
                let mmx = pm.plateTrack.grid.Xwc(scx);
                let mmy = pm.plateTrack.grid.Ywc(scy);
                pm.plateTrack.__menu__ = smenu;
                if (pm.plateTrack) {
                    pm.plateTrack.mouseMove(scx, scy)
                    if (pm.plateTrack.isDraggingScrollbar) {
                        return;
                    }
                    if (pm.plateTrack && pm.plateTrack.selectedPlate && pm.plateTrack.selectedPlate.viewWell) {
                        pm.plateTrack.selectedPlate.viewWell(scx, scy, pm.plateTrack)
                    }
                }
                if (!md) {

                }
                if (currentWorkbench && currentWorkbench.mouseMoveListener) {
                    return currentWorkbench.mouseMoveListener(scx, scy)
                }
            }

            let getPlot = (scx, scy) => {
                let pt = pm.plateTrack;

                for (let plot of pt.m_plots) {
                    if (plot._highlight === true && plot.inside(pt.grid, scx, scy)) {
                        return plot;
                    }
                }

                for (let plot of pt.m_plots) {
                    if (plot._highlight !== true && plot.inside(pt.grid, scx, scy)) {
                        return plot;
                    }
                }

                return null;
            };

            let drawPlateTracks = (ctx) => {
                if (pm.plateTrack && !pm.plateTrack.wb) {
                    pm.plateTrack.setWorkbench(wb);
                }
                if (ctx != null) {
                    pm.plateTrack.draw(ctx);

                    if (draw) {
                        draw(pm.plateTrack.grid, ctx);
                    }
                    if (currentShape && currentShape.draw != null) {
                        currentShape.draw(pm.plateTrack.grid, ctx)
                    }
                    if (ctx && smenu && pm.plateTrack != null) {
                        ctx.fillStyle = 'rgba(255,255,255,0.83)'
                        ctx.fillRect(pm.plateTrack.grid.xi, pm.plateTrack.grid.yi, pm.plateTrack.grid.width, pm.plateTrack.grid.height)
                        smenu.draw(ctx, pm.plateTrack.grid)
                    }
                }
            }
            graph.post_graphics_modifications = drawPlateTracks;

            window.addEventListener('dragover', (event) => {
                event.preventDefault();
            })
            window.addEventListener('drop', async (event) => {
                event.preventDefault();

                function parseExcelFile(file) {
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = function (e) {
                            try {
                                const data = new Uint8Array(e.target.result);
                                const workbook = XLSX.read(data, { type: 'array' });

                                const tables = {};

                                workbook.SheetNames.forEach(sheetName => {
                                    const worksheet = workbook.Sheets[sheetName];

                                    const table = [];

                                    const range = XLSX.utils.decode_range(worksheet['!ref']);
                                    for (let rowNum = range.s.r; rowNum <= range.e.r; rowNum++) {
                                        const row = [];

                                        for (let colNum = range.s.c; colNum <= range.e.c; colNum++) {
                                            const cellAddress = XLSX.utils.encode_cell({ r: rowNum, c: colNum });
                                            const cell = worksheet[cellAddress];

                                            if (cell) {
                                                const cellData = {
                                                    value: cell.v || "",
                                                    formula: cell.f || ""
                                                };
                                                row.push(cellData);
                                            } else {
                                                row.push({ value: "", formula: "" });
                                            }
                                        }
                                        table.push(row);
                                    }

                                    tables[sheetName] = table;
                                });

                                resolve(tables);
                            } catch (error) {
                                reject(`Error parsing Excel file: ${error.message}`);
                            }
                        };

                        reader.onerror = function (error) {
                            reject(`File read error: ${error}`);
                        };

                        reader.readAsArrayBuffer(file);
                    });
                }

                const file = event.dataTransfer.files[0];
                if (file && file.name.endsWith('.xlsx')) {

                    const reader = new FileReader();

                    reader.onload = async function (e) {
                        try {
                            console.log('debubg');
                            const data = new Uint8Array(e.target.result);
                            const workbook = XLSX.read(data, { type: 'array' });
                            const plates = [];

                            workbook.SheetNames.forEach(sheetName => {
                                const worksheet = workbook.Sheets[sheetName];
                                const table = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

                                let xmax = 0;
                                let ymax = 0;

                                table.forEach((row, rowIndex) => {
                                    const nonEmptyCols = row.filter(cell => cell !== null && cell !== "").length;
                                    if (nonEmptyCols > 0) {
                                        xmax = Math.max(xmax, rowIndex + 1);
                                        ymax = Math.max(ymax, nonEmptyCols);
                                    }
                                });

                                const trimmedTable = table.slice(0, xmax).map(row => row.slice(0, ymax));

                                const wells = trimmedTable.map((row, rowIndex) => {
                                    return row.map((cellValue, colIndex) => {
                                        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
                                        const cell = worksheet[cellAddress] || {};
                                        const well = new GenericWell(
                                            `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`,
                                            cell.v || cellValue,
                                            null,
                                            null
                                        );
                                        well.properties = {
                                            value: cell.v || cellValue || null,
                                            formula: cell.f || null,
                                            type: cell.t || null,
                                            raw: cell.w || null
                                        };
                                        return well;
                                    });
                                });

                                const plate = new Plate(sheetName, xmax, ymax);
                                plate.setWells(wells);
                                plates.push(plate);
                            });

                            let index = 1;
                            let prev = null;
                            for (let t of plates) {
                                if (prev != null) {

                                }
                                pm.plateTrack.appendPlate(t);
                                pm.plateTrack.wb(null)
                                prev = t;
                                index++;
                            }
                            pm.plateTrack.zoomtfit()
                            pm.plateTrack.wb(null)

                        } catch (error) {
                            alert(`Error parsing Excel file: ${error.message}`);
                        }
                    };

                    reader.readAsArrayBuffer(file);

                }
                else
                    if (file && file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = function (e) {
                            const img = new Image();
                            img.onload = function () {
                                ctx.clearRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                            };
                            img.src = e.target.result;
                        };

                        reader.readAsDataURL(file);
                    } else {

                    }
            })

            window.addEventListener('keydown', async (event) => {
                if (pm.plateTrack.isTextActive()) {
                    if (event.key === 'Escape') {
                        pm.plateTrack.setTextActive(false)
                        return;
                    }
                    return pm.plateTrack.handleKeyDown(event)
                }

                function arrayToExcelString(wells) {

                    const maxLength = Math.max(...wells.map(col => col.length));
                    wells.forEach(col => {
                        while (col.length < maxLength) {
                            col.push({ value: "" });
                        }
                    });

                    const trimmedWells = wells.filter(col => col.some(cell => cell.value !== "" && cell.value !== null && cell.value !== undefined));

                    const transposed = trimmedWells[0].map((_, rowIndex) => trimmedWells.map(col => col[rowIndex] || { value: "" }));

                    return transposed.map(row =>
                        row.map(cell => {

                            let cellText = String(cell.value).replace(/"/g, '""');

                            if (/[",\n\t]/.test(cellText)) {
                                cellText = `"${cellText}"`;
                            }
                            return cellText;
                        }).join('\t')
                    ).join('\n');
                }

                if (event.ctrlKey && event.key === 'c') {
                    console.log('Control + C was pressed');
                    event.preventDefault();
                    if (pm.plateTrack) {
                        let se = pm.plateTrack.getSelectedWells()

                        let v = arrayToExcelString(se)
                        pm.plateTrack.setMessage("Copy")
                        LJScript.add(pm.plateTrack.name, `copy canvas`)

                        navigator.clipboard.writeText(v).then(() => {
                            console.log("Object copied to clipboard!");
                        }).catch(err => {
                            console.error("Failed to copy object to clipboard: ", err);
                        });
                    }
                } else
                    if (event.ctrlKey && event.key === 'x') {
                        console.log('Control + C was pressed');
                        event.preventDefault();
                        if (pm.plateTrack) {
                            let se = await pm.plateTrack.getSelectedWellsInOrder()
                            pm.plateTrack.setMessage("Copied")
                            navigator.clipboard.writeText(JSON.stringify(se)).then(() => {
                                console.log("Object copied to clipboard!");
                            }).catch(err => {
                                console.error("Failed to copy object to clipboard: ", err);
                            });
                        }
                    } else
                        if (event.key === 'Delete') {

                        } else
                            if (event.key === 'Escape') {
                                event.preventDefault();
                                if (pm.plateTrack && pm.plateTrack.selectedPlate && pm.plateTrack.selectedPlate.textActive) {

                                    pm.plateTrack.selectedPlate.textActive = false;

                                }
                                else
                                    if (pm.plateTrack) {
                                        let se = await pm.plateTrack.getSelectedWellsInOrder()
                                        for (let s of se) {
                                            if (s.value != null && s.value.length > 0) {
                                                pushHistory(HM(s))
                                                s.value = ''
                                            }
                                        }
                                    }
                            }
            });

            const loadImageToCanvas = async (image) => {
                let b64 = await getBase64Image(image.src);
                image.src = b64;
                let xw = pm.plateTrack.grid.Xwc(100)
                let yw = pm.plateTrack.grid.Ywc(100)
                let ic = new Icon('base64', image, xw, yw, pm.plateTrack.grid.worldWidth(image.width), pm.plateTrack.grid.worldHeight(image.height));
                ic.b64 = b64;
                loaded = true;

                let plate = new Plate(generateNautName(), 1, 1);
                plate.plateType = 'annotation'
                plate.completeNullValues();
                plate.setWellType(0, 0, 'ICON')
                plate.wells[0][0].icon = ic;
                plate.grid.width = pm.plateTrack.grid.worldWidth(image.width);
                plate.grid.height = pm.plateTrack.grid.worldHeight(image.height);
                pm.plateTrack.addNextAvailableX(plate)

                image.onload = () => { }
            }

            window.addEventListener('paste', async (e) => {

                console.log('debubg');
                if (e.localName && e.localName.indexOf('text') >= 0) {
                    return;
                }
                if (e.target && e.target.localName.toString().indexOf('text') >= 0) {
                    return;
                }
                if (e.target && e.target.localName.toString().indexOf('input') >= 0) {
                    return;
                }

                if (eeditor_state.paste_to_graph) {
                    if (e.clipboardData == false) return false;
                    const items = e.clipboardData.items;
                    for (let i = 0; i < items.length; i++) {
                        let item = items[i]

                        if (item.type === 'text/plain') {

                            try {
                                item.getAsString(async (text) => {
                                    try {
                                        const parsed = JSON.parse(text);

                                        console.log('debubg');
                                        if (parsed.plateType && parsed.plateType === 'package') {
                                            const pl = Plate.buildPlateFromJSON(parsed)
                                            pm.plateTrack.addNextAvailableX(pl)
                                            setTimeout(() => {
                                                pm.plateTrack.zoomintoplate(pl)
                                            }, 1000)

                                        } else
                                            if (parsed.plate_track) {
                                                let confirm = await exec('baja/lib/confirm.js', 'Copy formula into the canvas.  This could overwrite some existing formulas', async () => {
                                                    pm.plateTrack.copyFromJSON(parsed.plate_track)
                                                })
                                                await showModal(confirm)
                                                return;
                                            } else {
                                                await exec('baja/plate/data/import-data.js', text, pm.plateTrack, genegraph_panel_layout)
                                            }
                                    } catch (exception_e) {
                                        await exec('baja/plate/data/import-data.js', text, pm.plateTrack, genegraph_panel_layout)

                                    }

                                });
                            } catch (exception) {
                                console.log(" exception meessage " + exception.message)
                            }

                        } else if (item.kind === 'file' && item.type === 'text/plain') {

                            const blob = item.getAsFile();
                            const reader = new FileReader();
                            reader.onload = async (e) => {
                                const text = e.target.result;
                                await exec('baja/plate/data/import-data.js', text, pm.plateTrack, genegraph_panel_layout)
                            };
                            reader.readAsText(blob);
                            return;
                        } else if (item.type.startsWith('image/') && items.length === 1) {

                            const file = item.getAsFile();
                            const img = new Image();
                            img.onload = () => loadImageToCanvas(img);
                            img.src = URL.createObjectURL(file);

                        }
                    }
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
                    exec('baja/screens/add-track.js', graph)
                })
            })
            track_items.push({
                'label': 'Track from sequence', 'ionfunction': createIonFunction(() => {
                    exec('baja/screens/new-track.js', graph, genegraph_panel_layout)
                })
            })
            track_items.push({
                'label': 'Navigate track', 'ionfunction': createIonFunction(async () => {
                    let script_canvas = await exec('baja/screens/menu/annotation-navigation-tools.js', graph, genegraph_panel_layout)
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    CurrentLayout.setComponent('buttonMenuPanel', script_canvas);
                })
            })
            track_items.push({
                'label': 'Paste...', 'ionfunction': createIonFunction(async () => {
                    await exec('screen/controls/paste-panel.js', graph, genegraph_panel_layout, eeditor_state)
                })
            })
            track_items.push({
                'label': 'Measure...', 'ionfunction': createIonFunction(() => {
                    exec('baja/screens/menu/measure-track.js', graph, genegraph_panel_layout)
                })
            })
            track_items.push({
                'label': 'Stats...', ionfunction: createIonFunction(async () => {
                    graph.setMessage("Click on a track to see stat menu for that track");
                    await exec('baja/screens/menu/track-stats.js', graph)
                })
            })

            track_items.push({
                'label': 'Show...', 'ionfunction': createIonFunction(async () => {
                    exec('baja/screens/menu/annotation/show-annotations-menu.js', graph)
                })
            })
            track_items.push({
                'label': 'Edit', ionfunction: createIonFunction(async () => {
                    graph.setMessage("Click on a track to see available edit options. ")
                    await exec('baja/screens/menu/edit-track.js', graph, genegraph_panel_layout)
                })
            })
            track_items.push({
                'label': 'Sequence', ionfunction: createIonFunction(async () => {
                    await exec('baja/screens/menu/edit-track-sequence.js', graph)
                })
            })

            track_items.push({
                'label': 'Export', ionfunction: createIonFunction(async () => {
                    graph.setMessage("Click on a track to see available edit options. ")
                    await exec('baja/screens/menu/export-track.js', graph)
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

                                                            graph.setMessage(" All tracks remvoed.");
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

            let md = false;
            let priority = false;

            let mdel = {
                'mouseUp': default_mouseUpListener,
                'mouseDown': default_mousedownListener,
                'mouseMove': default_mousemoveListener,
                'keyDown': default_keydownListener,

                'wheel': default_wheel,
                'getPriority': () => {
                    return priority;
                }
            }
            let geneGraph = await graph.createComponent(mdel);

            let plates_panel;
            let platePanel = createIonFunction((p) => {
                updateStatsPanel();
                plates_panel = p;
            })
            progressBar(50);

            function truncateString(str) {
                const maxLength = 50;
                if (str.length > maxLength) {
                    return str.slice(0, maxLength) + "...";
                }
                return str;
            }

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
                        plates_panel.setHTML(truncateString(ht));
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
                return await exec('baja/screens/my-submitted-screens-w.js', expid)
            }

            let select_display = createIonFunction((ref) => {
                select_display_html = ref;
            })
            let molecule_type_html_render = await exec('baja/screens/render-moltype.js')
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

            let htmlT = ''
            if (htmlT) {
                htmlT = JSON.stringify(htmlT)
            } else {
                htmlT = ''
            }

            let refChem = createIonFunction((d) => {
                htmlP = d
            })
            let button_canvas = await exec('screen/controls/navigation-panel-plates.js', pm)

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

                        ]]
                }
            }
            progressBar(60);
            let publishSaveScreen = async () => {
                let savedScreens = await exec('screen/io/publish.js', graph, genegraph_panel_layout)
                showModal(savedScreens);
            }
            let saveSaveScreen = async () => {
                await exec('screen/io/save-obj-tp.js', graph, genegraph_panel_layout, path)
            }
            let openWF = async () => {
                let v = await exec('baja/table/io/open-nautilus', pm)
                showModal(v)
            }
            let openSaveScreen = async () => {
                let v = await exec('baja/table/io/open-yakro', graph, pm, config)
                showModal(v)
            }
            let importSaveScreen = async () => {
                let v = await exec('baja/table/io/import-yakro', graph)
                showModal(v)
            }

            let tools_menu = []
            tools_menu = [
                {
                    'label': 'Tables', 'ionfunction': createIonFunction(async () => {
                        let button_canvas_ = await exec('screen/controls/navigation-panel-plates.js', pm)
                        CurrentLayout.clearComponent('buttonMenuPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', button_canvas_);
                    })
                },
                {
                    'label': 'Gene', 'ionfunction': createIonFunction(async () => {
                        let button_canvas_ = await exec('screen/controls/navigation-panel.js', graph)
                        CurrentLayout.clearComponent('buttonMenuPanel,labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', button_canvas_);
                    })
                },
                {
                    'label': 'ASO', 'ionfunction': createIonFunction(async () => {
                        graph.showWindowMenu(await exec('baja/screens/menu/load-chemistry-tools', graph, genegraph_panel_layout), 10, 10, 400)
                    })
                },
                {
                    'label': 'Chemistry', ionfunction: createIonFunction(async () => {
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        setTimeout(async () => {
                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                            await exec('screen/choose-chemistry.js', graph, genegraph_panel_layout)
                        }, 100)
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    })
                },
                {
                    'label': 'Assay design', 'ionfunction': createIonFunction(async () => {
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        await exec('baja/screens/menu/assay-tools.js', graph, genegraph_panel_layout)
                    })
                },
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

            let file_items = []
            if (user != null && user.length > 0) {
                file_items.push({
                    'label': 'New Yak', 'ionfunction': createIonFunction(async () => {
                        let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to delete all and start over?', async () => {
                            pm.plateTrack.reset();

                        })
                        showModal(confirm)

                    })
                })
                file_items.push({
                    'label': 'Copy All', 'ionfunction': createIonFunction(async () => {
                        const currentstate = await pm.plateTrack.capturePlateState();
                        try {
                            navigator.clipboard.writeText(currentstate).then(() => {
                                console.log("Object copied to clipboard!");
                                pm.plateTrack.setMessage(" Copied ")
                            }).catch(err => {
                                console.error("Failed to copy object to clipboard: ", err);
                            });
                            console.log('JSON plate state written to clipboard as plain text.');
                        } catch (err) {
                            console.error('Failed to write JSON plate state to clipboard:', err);
                        }

                    })
                })

                file_items.push({
                    'label': 'Paste', 'ionfunction': createIonFunction(async () => {

                    })
                })

                file_items.push({
                    'label': 'Open', 'ionfunction': createIonFunction(openSaveScreen)
                })
                file_items.push({
                    'label': 'Import', 'ionfunction': createIonFunction(importSaveScreen)
                })

                file_items.push({
                    'label': 'Save', 'ionfunction': createIonFunction(saveSaveScreen)
                })
                file_items.push({
                    'label': 'Folders...', 'ionfunction': createIonFunction(
                        async () => {
                            await exec('screen/io/manage-files.js')
                        }
                    )
                })

            }
            file_items.push(

            )

            let editor;
            let innerComponentCallback__ = createIon((_panel) => {
                editor = _panel;
                if (editor) {
                    editor.setContent('')

                }
            })
            let editor2;
            let innerComponentCallback2 = createIon((_panel) => {
                editor2 = _panel;
            })

            function isArrayofArrays(variable) {
                return Array.isArray(variable) && variable.every(Array.isArray);
            }

            function arrayOfArraysToTable(arr) {
                if (!Array.isArray(arr) || !arr.every(Array.isArray)) {
                    throw new Error('Input must be an array of arrays');
                }

                const maxRows = Math.max(...arr.map(innerArr => innerArr.length));

                let table = '';

                for (let row = 0; row < maxRows; row++) {
                    let rowString = '';

                    for (let col = 0; col < arr.length; col++) {
                        const value = arr[col][row] !== undefined ? arr[col][row] : '';
                        rowString += value + '\t';
                    }

                    table += rowString.trim() + '\n';
                }

                return table;
            }

            let new_plate_panel;
            let __nameHook___ = createIonFunction((ed) => {
                new_plate_panel = ed;
            });
            let new_type_panel;
            let __nameHook2 = createIonFunction((ed) => {
                new_type_panel = ed;
            });

            const tree = await exec('baja/table/datayak-workbench-tables-tree', pm, graph)

            let yakfoldernames = [
                {
                    'label': 'Package current workspace', 'click': async () => {
                        graph.graph.canvas.canvas.nativeElement.focus();
                        const a = await exec('baja/package/trackpackyak', graph, pm.plateTrack);
                    }
                },
                {
                    'label': 'Cancel', 'click': async () => {
                        CurrentLayout.reset('mainPanel');
                    }
                }
            ]

            let interpreter = await exec('baja/engine/interpreter.js', pm.plateTrack)
            genegraph_panel_layout = {
                wid: 'card',
                componentRef: 'geneGraphPanel',
                data: {
                    cards: [
                        [
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
                                'height': '100vh',
                                'component': genegraph_panel_layout
                            }
                        ]]
                }
            }
            clear();
            showWidget(
                main_layout
            );
            CurrentLayout.stash('mainPanel', genegraph_panel_layout)

            working.status = 'complete'
            let m = window['env']['theme']
            if (!m) {
                m = 'bajabio'
            }
            graph.setMessageCenter(m, 40)
            if (wb)
                wb(null)
            setTimeout(() => {
                graph.isPreviousState().then(r => {
                    if (r) {
                    }
                })

                wb(null)

                graph.setMessage('')
                graph.setMessageCenter(' bajabio ', 40)
                pm.plateTrack.__canvas__ = graph.graph.canvas;
                CurrentLayout.stash('graph-canvas', graph.graph.canvas)
                CurrentLayout.stash('plate-track', pm)
                CurrentLayout.stash('graph', graph)
            }, 1000)
        })

    })

}
