return new Promise(async (resolve, reject) => {
    let SnpIndel = await exec('flexigraph/snpindel.js')
    let MGrid = await exec('flexigraph/grid.js')
    let Annotation = await exec('flexigraph/annotation2.js')
    let RNASecondaryStructure = await exec('baja/structure/rna-secondary-structure-track.js')
    let Highlighter = await exec('baja/bio/highlighter.js')
    let highlighters = new Highlighter().getTrackHighlighters();
    let TrackPlot = await exec('flexigraph/track-plot.js')
    let codon = await exec('baja/bio/aa/codons.js')
    let codon_colors = await exec('baja/bio/aa/colors.js')
    let Biopolymer = await exec('baja/chem/biopolymer.js')
    let AttributionLayer = await exec('baja/bio/attribution-layer.js')
    let AttributionSushimiLayer = await exec('baja/bio/attribution-sushimi-layer.js')
    let TrackLayer = await exec('baja/bio/track-layer.js');
    let Menu = await exec('flexigraph/menu')

    const bsize = 25;

    let Oligo = await exec('flexigraph/oligo.js')
    let SIRNA = await exec('flexigraph/sirna.js')
    let Barchart = await exec('baja/bio/barchart-track.js')
    function drawLine(ctx, x1, y1, x2, y2, color = "black", lineWidth = 1) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        ctx.closePath();
    }
    function drawArrowhead(ctx, x, y, angle, length = 10, width = 6, color = "black") {
        ctx.save();
        ctx.translate((x), (y));

        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-length, width / 2);
        ctx.lineTo(-length, -width / 2);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
    }
    function drawVerticalLine(ctx, xsc, ysc, height, color = "black", lineWidth = 1) {
        ctx.beginPath();
        ctx.moveTo(xsc, ysc);
        ctx.lineTo((xsc), (ysc) - (height));
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        ctx.closePath();
    }
    function drawHorizontalLine(ctx, x, y, width, color = "black", lineWidth = 1) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + width, y);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        ctx.closePath();
    }
    function drawString(ctx, text, x, y, color = "black", font = "12px sans-serif", align = "center", baseline = "middle") {
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = font;
        ctx.textAlign = align;
        ctx.textBaseline = baseline;
        ctx.fillText(text, (x), (y));
        ctx.restore();
    }
    // The species / coordinate caption above a track, drawn as a TAB rather than loose text.
    //
    // It used to go through drawString, whose default alignment is centre -- so the caption was
    // centred on the track's left edge and half of it hung off into the margin, overlapping
    // whatever sat to the left. A tab anchors it: square where it meets the track so it reads
    // as attached, rounded on its two top corners, and sitting above the track's own graphics.
    //
    // Fixed pixel sizes, not the zoom-scaled track font: this is chrome describing the track,
    // and chrome that grows and shrinks with the data underneath it reads as part of the data.
    function drawTrackTab(ctx, primary, secondary, x, yBottom) {
        if (!primary && !secondary) return;
        ctx.save();
        const BOLD = '700 11px Arial, Helvetica, sans-serif';
        const PLAIN = '11px Arial, Helvetica, sans-serif';
        const padX = 8, gap = 7, h = 16, r = 5;

        ctx.font = BOLD;
        const wP = primary ? ctx.measureText(primary).width : 0;
        ctx.font = PLAIN;
        const wS = secondary ? ctx.measureText(secondary).width : 0;
        const w = wP + (wP && wS ? gap : 0) + wS + padX * 2;
        const yTop = yBottom - h;

        ctx.beginPath();
        ctx.moveTo(x, yBottom);
        ctx.lineTo(x, yTop + r);
        ctx.quadraticCurveTo(x, yTop, x + r, yTop);
        ctx.lineTo(x + w - r, yTop);
        ctx.quadraticCurveTo(x + w, yTop, x + w, yTop + r);
        ctx.lineTo(x + w, yBottom);
        ctx.closePath();
        ctx.fillStyle = 'rgba(238,243,249,0.96)';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(11,37,69,0.30)';
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const ty = yTop + h / 2;
        let tx = x + padX;
        if (primary) {
            ctx.font = BOLD;
            ctx.fillStyle = '#0b2545';
            ctx.fillText(primary, tx, ty);
            tx += wP + gap;
        }
        if (secondary) {
            ctx.font = PLAIN;
            ctx.fillStyle = '#5b6b7d';   // quieter than the species: it is the detail, not the label
            ctx.fillText(secondary, tx, ty);
        }
        ctx.restore();
    }
    function fillTranslucentRect(ctx, x, y, w, h, {
        lineWidth = 1,
        shadowBlur = 2,
        shadowColor = 'black',
        // Transparent YELLOW. This is the wash drawn over a track while it is selected (the
        // only caller is the showResizeBar block below), so it sits under the sequence letters
        // and everything else on the track: it has to read as "this is selected" without
        // tinting what is drawn on top of it. The previous faint blue was close enough to the
        // track's own colouring to be missed. Alpha stays low for the same reason.
        fillStyle = 'rgba(255,214,10,0.16)',
        strokeStyle = 'rgba(255,214,10,0.16)',
        doStroke = false
    } = {}) {
        ctx.save();
        ctx.lineWidth = lineWidth;
        ctx.shadowBlur = shadowBlur;
        ctx.shadowColor = shadowColor;
        ctx.fillStyle = fillStyle;
        ctx.strokeStyle = strokeStyle;

        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();
        if (doStroke) ctx.stroke();

        ctx.restore();
    }

    function deepClone(v) {
        if (v === null || typeof v !== "object") return v;
        if (Array.isArray(v)) return v.map(deepClone);
        const out = {};
        for (const k of Object.keys(v)) out[k] = deepClone(v[k]);
        return out;
    }

    function defaultGridFactory(g) {

        let grid = Object.assign(new MGrid(), g)
        grid.rescale();

        return grid;
    }

    let Track = class Track {
        name = 'untitled';
        geneID;
        track_type = null;
        createdBy = null;
        createdDate = null;
        highlightbutton = false;

        xi;
        xf;
        strand;
        color = 'rgb(153,159,198)';
        y = 1;
        annotations = [];
        oligos = [];
        snpindels = [];
        showPlots = true;
        plots = [];
        sequence;
        markstart;
        markend;
        highlightstart;
        highlightend;
        grid;
        description;
        genomicsCoord = []
        showName = false;
        targetPhase = null;
        targetVariant = null;
        hideTrackCoords = true;
        showResizeBar = true;
        trackRef = null;
        showTrackRefMap = false;
        structures = [];
        highlight_features = {}
        track_layers = []
        track = []
        chr;
        species;
        showSnpIndels = true;
        showLayers = true;
        showOfftargets = true;
        showOligoMap = false;
        showArc = false;
        orf;
        orfhash;
        id = uuid();
        transcriptID;
        highlightIndex;
        default_track_height = -2;
        showAnnotaions = true;

        buttons = [
            {
                name: "move", x: 0 + bsize, y: 10, width: 20, height: 20, action: async (bx, by, x, y, pt) => { return this.setMoveListeners(pt, x, y) },
                highlight: async (bx, by, x, y, pt) => { return await this.hlbutton('move') }, highlight_color: 'cyan', color: 'lightcyan'
            },
            {
                name: "minimize", x: 0 + bsize, y: 10, width: 20, height: 20, action: async (pt) => { return await this.displayContextSpecificMenuItems(pt) },
                highlight: async (bx, by, x, y, pt) => { return await this.hlbutton('minimize') }, highlight_color: 'cyan', color: 'lightcyan'
            },
            {
                name: "close", x: 0 + bsize, y: 10, width: 20, height: 20, action: async (bx, by, x, y, pt) => { return await this.closePlot(pt) },
                highlight: async () => { return await this.hlbutton("close") }, highlight_color: 'cyan', color: 'lightcyan'
            },

        ];

        constructor(name, xi, xf, y, strand) {
            this.name = '' + name;
            this.xi = xi;
            this.xf = xf;
            this.y = y;
            this.strand = strand;
            this.grid = new MGrid(0, y, xf - xi, -1);
            this.grid.xi = 0;
            this.grid.setxmax(xf);
            this.grid.setymax(1.5);
            this.grid.setxmin(xi);
            this.grid.setymin(-1.5);
            this.grid.setSize(xf - xi, -1);
            this.grid.setInset(0, 0)
            this.grid.height = this.default_track_height;
            this.grid.rescale();
            this.structure = null;
            if (this.name && this.name.startsWith('/')) {
                let lastIndex = this.name.lastIndexOf('/')
                if (lastIndex > 0)
                    this.name = this.name.substring(lastIndex + 1)
            }

        }
        hlbutton() {

        }

        async displayContextSpecificMenuItems(pt) {
            let m = []

            m.push(
                {
                    label: `Load transcript`,
                    click: async (scx, scy) => {

                        let v;
                        let build = 'hg38';
                        let host_ = window['env']['apiUrl']
                        let identifyIdentifierType = (identifier) => {
                            const ensemblRegex = /^ENS[A-Z]+[0-9]+$/;
                            const ncbiRegex = /^[0-9]+$/;
                            if (ensemblRegex.test(identifier)) {
                                return "ID";
                            }
                            if (ncbiRegex.test(identifier)) {
                                return "ID";
                            }
                            return "Symbol";
                        }
                        function extractFirstEnsemblId(inputString) {
                            const pattern = /ENS[GTPE]\d+/;
                            const match = inputString.match(pattern);
                            return match ? match[0] : null;
                        }

                        let export_sequence = {
                            wid: 'card',
                            componentRef: 'bottomPanel',
                            data: {
                                height: '800px',
                                cards: [
                                    [
                                        {
                                            'title': 'ENSEMBL ID, NCBI ID, or Symbol',
                                            'width': '100%',
                                            'component': {
                                                wid: 'input-textarea-editor',
                                                data: {
                                                    'showButton': false,
                                                    'title': 'ID',
                                                    'ionHookFunction': createIonFunction((input_box) => {
                                                        v = input_box;
                                                    })
                                                }
                                            }
                                        },
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: `Find transcript from gene symbol...`
                                            }
                                        },
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'input-textfield',
                                                data: {
                                                    'show-button': false,
                                                    'title': 'Find transcript by gene  symbol',
                                                    'text': '',
                                                    'typeahead_url': `${host_}/gene-lookup`,
                                                    'typeahead_fields': ['Ensembl Canonical', 'Gene name', 'Gene Synonym', 'Gene description', 'Transcript stable ID'],
                                                    'optionSelected': createIonFunction((value) => {
                                                        let transcript = extractFirstEnsemblId(value.toString())
                                                        v.updateValue(transcript);
                                                    }),
                                                    'ionHookFunction': createIonFunction((input_box) => {
                                                        build = input_box;
                                                    })
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
                                                            label: 'Load', ionFunction: createIonFunction(async () => {
                                                                let ct = v.getWidgetValue();
                                                                if (ct.indexOf('.') > 0)
                                                                    ct = ct.substring(0, ct.indexOf('.'))
                                                                if (ct.indexOf('\n') > 0) {
                                                                    let list = ct.split('\n');
                                                                    for (let l of list) {
                                                                        if (l.trim().length > 0) {
                                                                            if (identifyIdentifierType(l) === 'ID')
                                                                                await this.addTranscript(l, null, null, build.value)
                                                                            else {
                                                                                let res = await exec('py/gene/ensembl-transcript.py', l)
                                                                                if (res && res[l.trim()]['canonical_transcript']) {
                                                                                    let idv = res[l.trim()]['canonical_transcript']
                                                                                    await this.addTranscript(idv, null, null, build.value)
                                                                                } else {
                                                                                    pt.setMessage(" Faild to find the canonical transcript for " + l);
                                                                                    hideAllModal();
                                                                                }
                                                                            }
                                                                        }
                                                                    }
                                                                } else {
                                                                    let l = ct.trim();
                                                                    if (identifyIdentifierType(l) === 'ID')
                                                                        await this.addTranscript(l, null, null, build.value)
                                                                    else {
                                                                        let res = await exec('py/gene/ensembl-transcript.py', l)
                                                                        if (res && res[l.trim()]['canonical_transcript']) {
                                                                            let idv = res[l.trim()]['canonical_transcript']
                                                                            await this.addTranscript(idv, null, null, build.value)
                                                                        }
                                                                        else {
                                                                            pt.setMessage(" Faild to find the canonical transcript for " + l);
                                                                            hideAllModal();
                                                                        }
                                                                    }

                                                                    hideAllModal();
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
                        showModal(export_sequence)

                    },
                    move: () => {
                    }
                });

            const smenu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(205, 255, 155)', 'navy', 2)
            setTimeout(() => {
                pt.setMenu(smenu)
            }, 200)
        }

        async addTranscript(ensembleId, x, y, source) {
            ensembleId = ensembleId.trim();
            if (ensembleId.startsWith('NM_') || ensembleId.startsWith('NC_')) {
                let mapped = await exec('py/ensembl/ncbi_to_ensembl.py', ensembleId)
                if (mapped && mapped.length == 1) {
                    this.setMessage(" Loading..." + JSON.stringify(mapped))
                    return this.addTranscript(mapped[0], x, y, source)
                }
                return this.addNCBI(ensembleId)
            } else {
                let prefix = null;
                let genomes = ["HG19", "GRCH38"];
                if (source && genomes.includes(source.toUpperCase())) {
                    prefix = `https://rest.ensembl.org`;
                } else {
                    prefix = `https://rest.ensembl.org`;
                }
                if (ensembleId.indexOf('.') > 0) {
                    ensembleId = ensembleId.substring(0, ensembleId.indexOf('.'))
                }
                let js = {}
                try {

                    if (ensembleId.toUpperCase().startsWith("ENST")) {
                        this.setMessage(' Loading... ' + ensembleId)
                        let host_ = window['env']['apiUrl']
                        let try_local = host_ + `/transcript/${ensembleId}`;
                        js = await GETJSON(try_local);
                        let jsm = js[0]
                        for (let jl of js) {
                            if (jl.feature === 'transcript') {
                                jsm = jl
                                break;
                            }
                        }
                        let desc = jsm.attributes.gene_name + ';' + jsm.attributes.transcript_name
                        let geneID = jsm.attributes.ID;
                        let start = parseInt(jsm['start'])
                        let end = parseInt(jsm['end'])

                        let strand = jsm['strand']
                        let chr = jsm['seqname']
                        if (strand === '+' || parseInt(strand) > 0) {
                            strand = 1;
                        } else {
                            strand = -1;
                        }

                        this.strand = strand;
                        this.xmin = start;
                        this.xmax = end;

                        this.transcriptID = ensembleId;
                        // The local /transcript endpoint returns GTF records with no species
                        // field, and this used to fill the gap with the constant 'Human' -- so
                        // a mouse or cyno transcript loaded here was labelled Human. Read it
                        // from the stable id instead, and leave it blank when the id does not
                        // say (a RefSeq accession does not encode the organism).
                        this.species = speciesFromTranscriptId(ensembleId);
                        this.chr = chr;
                        const regex = /\d+/;
                        const match = this.chr.match(regex);
                        if (match) {
                            this.chr = parseInt(match[0], 10);
                        }
                        this.description = desc;
                        this.geneID = geneID
                        let ensembl_sequence = prefix + `/sequence/id/${ensembleId}?content-type=text/plain`;
                        let fasta = await GETXT(ensembl_sequence)
                        fasta = fasta.trim();
                        if (this.strand < 0) {
                            let temp = '';
                            for (let c = fasta.length - 1; c >= 0; c--) {   // >= 0: c > 0 dropped fasta[0], leaving the minus-strand sequence one base short
                                temp += fasta[c]
                            }
                            this.setSequence(temp)
                        } else {
                            this.setSequence(fasta)
                        }
                        let annotations = this.createTrackFromLocal(js);
                        for (let an of annotations) {
                            this.add(an)
                        }
                        this.generateORF();
                        return;
                    } else {
                        js = await GETJSON(prefix + `/lookup/id/${ensembleId}?expand=1;content-type=application/json`);
                    }

                } catch (exception) {
                    js = await GETJSON(prefix + `/lookup/id/${ensembleId}?expand=1;content-type=application/json`);

                }

                if (!js) {
                    console.log(" ensembl " + prefix + `/lookup/id/${ensembleId}?expand=1;content-type=application/json`)
                    js = await GETJSON(prefix + `/lookup/id/${ensembleId}?expand=1;content-type=application/json`);
                }

                if (js) {
                    if (js['object_type'] === 'Gene') {
                        let t = await this.loadEnsembleGene(js, prefix)
                        return t;
                    } else {
                        let species = js['species']
                        let chromosome = js['seq_region_name']
                        let start = +js['start']
                        let end = +js['end']

                        this.grid.xmin = start;
                        this.grid.xmax = end;

                        let strand = js['strand']
                        if (strand === '+' || parseInt(strand) > 0) {
                            strand = 1;
                        } else {
                            strand = -1;
                        }
                        this.strand = strand;
                        let geneID = js['Parent']
                        let desc = js['display_name']
                        this.transcriptID = ensembleId;
                        this.species = species || speciesFromTranscriptId(ensembleId);
                        this.chr = chromosome;
                        this.description = desc;
                        this.geneID = geneID
                        let ensembl_sequence = prefix + `/sequence/id/${ensembleId}?content-type=text/plain`;
                        let fasta = await GETXT(ensembl_sequence)
                        fasta = fasta.trim();
                        if (this.strand < 0) {
                            let temp = '';
                            for (let c = fasta.length - 1; c >= 0; c--) {   // >= 0: c > 0 dropped fasta[0], leaving the minus-strand sequence one base short
                                temp += fasta[c]
                            }
                            this.setSequence(temp)
                        } else {
                            this.setSequence(fasta)
                        }
                        this.buildENSEMBLAnnotations(js);
                    }
                }
            }
        }

        async loadEnsembleGene(obj, prefix) {
            let ajs = obj['Transcript']
            let ensembleId = obj['id']
            let index = 0;
            let startxi = 0;
            let startyi = 0;
            let endx = 220;
            let endy = 1;
            for (let js of ajs) {
                let species = js['species']
                let chromosome = js['seq_region_name']
                let start = +js['start']
                let end = +js['end']
                let strand = js['strand']
                let geneID = js['Parent']
                let transcriptId = js['id']
                let desc = js['display_name']
                if (!desc) {
                    desc = ''
                }

                let biotype = js['biotype']
                let display_name = js['display_name']

                if (biotype == null) {
                    biotype = '';
                }
                if (display_name == null) {
                    display_name = '-';
                }

                this.transcriptID = transcriptId;
                this.species = species || speciesFromTranscriptId(transcriptId);
                this.chr = chromosome;
                this.description = desc.toString();

                this.geneID = geneID
                this.tgraph.xi = 0;
                let ensembl_sequence = prefix + `/sequence/id/${transcriptId}?content-type=text/plain`;
                let fasta = await GETXT(ensembl_sequence)
                fasta = fasta.trim();
                if (this.strand < 0) {
                    let temp = '';
                    for (let c = fasta.length - 1; c >= 0; c--) {   // >= 0: c > 0 dropped fasta[0], leaving the minus-strand sequence one base short
                        temp += fasta[c]
                    }
                    this.setSequence(temp)
                } else {
                    this.setSequence(fasta)
                }
                index++;
                this.buildENSEMBLAnnotations(js);
                return t;
            }

            for (let t of this.track) {
                t.showResizeBar = false;
            }

            setTimeout(() => {
                this.animateTo(startxi, endx, startyi, endy)
                this.setMouseMode('navigate')

            }, 1500)

        }

        buildENSEMBLAnnotations(js) {
            let orig = js['object_type'];
            if (js['object_type'] === 'Transcript' || orig === 'Gene') {

                let exons = js['Exon'];
                if (exons) {
                    for (let exon of exons) {
                        console.log(exon['object_type'])

                        this.add(new Annotation(exon['object_type'], exon['id'], exon['start'], exon['end']))

                    }
                }

                let tr = js['Translation'];
                if (tr) {
                    let strand = this.strand;
                    let start = tr['start'];
                    let cend = tr['end']
                    if (strand > 0) {
                        let annotation = new Annotation('TSS', 'TSS', start, start + 3)
                        this.add(annotation)
                        this.add(new Annotation('Translation', 'Translation', start, cend))
                    }
                    else {
                        let annotation = new Annotation('TSS', 'TSS', cend - 2, cend + 1)
                        this.add(annotation)

                    }
                }
            }
            this.generateORF();
        }

        addNCBI(ncbi, x, y) {

            exec('baja/ncbi/get-transcript.js', ncbi).then(async (js) => {
                if (js) {
                    let start = +js['start']
                    let end = +js['end']
                    let strand = js['strand']
                    let xm = 0.1 * this.grid.width
                    let sequence = js['sequence']
                    sequence = sequence.trim();
                    this.setSequence(sequence)

                }
            })
        }

        getButtonAt(sx, sy, pt) {

            this.grid.rescale();
            const screenHeight = Math.abs(this.getHeight());
            const syGrid = this.grid.yi;

            if ((syGrid + screenHeight) < 0) return null;

            const b = this.buttons;
            if (!b || !b.length) return null;

            let init = (this.grid.xi + this.grid.width - this.buttons.length * bsize);
            if (init < 0) init = 0;

            for (let index = 0; index < b.length; index++) {
                const button = b[index];

                let buttonX = pt.grid.X(init) + index * bsize;
                let buttonY = pt.grid.Y(this.grid.yi - (this.margin.top) + this.grid.height);
                const buttonHeight = button.height;

                if (buttonY < 0 && (buttonY + screenHeight) > 0) {
                    buttonY = 10;
                }

                if (button.name === "close" || button.name === "move" || button.name === "minimize") {
                    const circleRadius = Math.min(bsize, buttonHeight) / 2;
                    const centerX = buttonX + bsize / 2;
                    const centerY = buttonY + buttonHeight / 2;

                    const dx = sx - centerX;
                    const dy = sy - centerY;
                    const inside = (dx * dx + dy * dy) <= (circleRadius * circleRadius);
                    if (inside) {
                        return { button, index };
                    }
                } else {

                    const inside =
                        sx >= buttonX && sx <= (buttonX + bsize) &&
                        sy >= buttonY && sy <= (buttonY + buttonHeight);
                    if (inside) {
                        return { button, index };
                    }
                }
            }

            return null;
        }

        handlePointerDown(evt, pt, canvas) {
            const rect = canvas.getBoundingClientRect();
            const sx = evt.clientX - rect.left;
            const sy = evt.clientY - rect.top;

            const hit = this.getButtonAt(sx, sy, pt);
            if (!hit) return;

            this.highlightbutton = hit.button.name;

            switch (hit.button.name) {
                case "close":

                    break;
                case "move":

                    break;
                case "minimize":

                    break;
                default:

                    if (typeof hit.button.onClick === "function") {
                        hit.button.onClick({ index: hit.index, screen: { x: sx, y: sy } });
                    }
            }
        }

        drawButtons(ctx, pt) {

            this.grid.rescale();
            let screen_height = Math.abs(this.getHeight());
            let screen_width = (this.getWidth());
            let sy = (this.grid.yi);
            if ((sy + screen_height) < 0) {
                return;
            }
            let index = 0;
            let b = this.buttons;
            let init = (this.grid.xi + this.grid.width - this.buttons.length * bsize);
            if (init < 0) {
                init = (0);
            }
            ctx.lineWidth = 1;
            for (let button of b) {

                if (this.highlightbutton && button.name === this.highlightbutton)
                    ctx.fillStyle = button.highlight_color;
                else
                    ctx.fillStyle = button.color;
                let buttonX = pt.grid.X(init) + index * bsize;
                let buttonY = pt.grid.Y(this.grid.yi - (this.margin.top) + this.grid.height);
                let buttonHeight = button.height;

                if (buttonY < 0 && (buttonY + screen_height) > 0) {
                    buttonY = 10;
                }
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 2;
                ctx.shadowOffsetX = 1;
                ctx.shadowOffsetY = 1;
                if (button.name === "close") {
                    let circleRadius = Math.min(bsize, buttonHeight) / 2;
                    let centerX = buttonX + bsize / 2;
                    let centerY = buttonY + buttonHeight / 2;

                    ctx.beginPath();
                    ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.shadowBlur = 10;
                    ctx.shadowOffsetX = 2;
                    ctx.shadowOffsetY = 2;
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 2;

                    let padding = 5;
                    let x1 = centerX - circleRadius + padding;
                    let y1 = centerY - circleRadius + padding;
                    let x2 = centerX + circleRadius - padding;
                    let y2 = centerY + circleRadius - padding;

                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.moveTo(x1, y2);
                    ctx.lineTo(x2, y1);
                    ctx.stroke();
                }
                else if (button.name === "move") {

                    let circleRadius = Math.min(bsize, buttonHeight) / 2;
                    let centerX = buttonX + bsize / 2;
                    let centerY = buttonY + buttonHeight / 2;

                    ctx.beginPath();
                    ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                    ctx.fill();

                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetX = 2;
                    ctx.shadowOffsetY = 2;
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 1;
                    let arrowLength = circleRadius * 0.8;
                    let arrowHead = 2;

                    ctx.beginPath();
                    ctx.moveTo(centerX, centerY - arrowLength);
                    ctx.lineTo(centerX, centerY - arrowLength + arrowHead);
                    ctx.lineTo(centerX - arrowHead, centerY - arrowLength + arrowHead);
                    ctx.moveTo(centerX, centerY - arrowLength + arrowHead);
                    ctx.lineTo(centerX + arrowHead, centerY - arrowLength + arrowHead);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(centerX, centerY + arrowLength);
                    ctx.lineTo(centerX, centerY + arrowLength - arrowHead);
                    ctx.lineTo(centerX - arrowHead, centerY + arrowLength - arrowHead);
                    ctx.moveTo(centerX, centerY + arrowLength - arrowHead);
                    ctx.lineTo(centerX + arrowHead, centerY + arrowLength - arrowHead);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(centerX - arrowLength, centerY);
                    ctx.lineTo(centerX - arrowLength + arrowHead, centerY);
                    ctx.lineTo(centerX - arrowLength + arrowHead, centerY - arrowHead);
                    ctx.moveTo(centerX - arrowLength + arrowHead, centerY);
                    ctx.lineTo(centerX - arrowLength + arrowHead, centerY + arrowHead);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(centerX + arrowLength, centerY);
                    ctx.lineTo(centerX + arrowLength - arrowHead, centerY);
                    ctx.lineTo(centerX + arrowLength - arrowHead, centerY - arrowHead);
                    ctx.moveTo(centerX + arrowLength - arrowHead, centerY);
                    ctx.lineTo(centerX + arrowLength - arrowHead, centerY + arrowHead);
                    ctx.stroke();

                }

                else if (button.name === "minimize") {
                    let circleRadius = Math.min(bsize, buttonHeight) / 2;
                    let centerX = buttonX + bsize / 2;
                    let centerY = buttonY + buttonHeight / 2;
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetX = 2;
                    ctx.shadowOffsetY = 2;
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    ctx.font = `${circleRadius}px Arial`;
                    ctx.fillStyle = 'black';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('M', centerX, centerY);

                } else {

                    ctx.fillRect(buttonX, buttonY, bsize, buttonHeight);

                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetX = 2;
                    ctx.shadowOffsetY = 2;
                    ctx.strokeStyle = 'black';
                    ctx.strokeRect(buttonX, buttonY, bsize, buttonHeight);
                    ctx.fillStyle = 'black';
                    ctx.font = '9px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    let centerX = buttonX + bsize / 2;
                    let centerY = buttonY + buttonHeight / 2;
                    ctx.fillText(button.name, centerX, centerY);
                }

                index++;
            }
        }

        static fromJSONObject(data, {
            gridFactory = defaultGridFactory,
            layerFactory = (l) => ({ ...l }),
            structureFactory = (s) => ({ ...s }),
            plotFactory = (p) => ({ ...p }),
            annotationFactory = (a) => ({ ...a }),
            trackRefFactory = (r) => ({ ...r })
        } = {}) {
            if (typeof data === "string") {
                try { data = JSON.parse(data); } catch (e) { throw new Error("Invalid JSON string for Track.fromJSONObject"); }
            }
            if (!data || typeof data !== "object") {
                throw new Error("Track.fromJSONObject expected a JSON object or string");
            }

            const t = new this();

            const copyIfDefined = (k) => { if (k in data) t[k] = data[k]; };

            [
                "id", "name", "geneID", "track_type", "createdBy", "createdDate",
                "xi", "xf", "y", "strand", "color",
                "markstart", "markend", "highlightstart", "highlightend",
                "description", "genomicsCoord", "showName", "targetPhase", "targetVariant",
                "hideTrackCoords", "showResizeBar", "showTrackRefMap",
                "chr", "species", "showSnpIndels", "showLayers", "showOfftargets", "showOligoMap", "showArc",
                "transcriptID", "highlightIndex", "default_track_height", "showAnnotaions"
            ].forEach(copyIfDefined);

            if ("sequence" in data) t.sequence = data.sequence;
            if ("orfhash" in data) t.orfhash = data.orfhash;
            if ("orf" in data) t.orf = deepClone(data.orf);

            if (data.grid) {
                t.grid = gridFactory(data.grid, t);
            }

            if (data.trackRef) {

                t.trackRef = {};
            }

            if (t.trackRef && typeof t.trackRef === "object") {
                t.trackRef.track = t;
            }

            t.annotations = Array.isArray(data.annotations)
                ? data.annotations.map((a) => annotationFactory(a, t))
                : [];

            t.oligos = Array.isArray(data.oligos)
                ? data.oligos.map((o) => deepClone(o))
                : [];

            t.snpindels = Array.isArray(data.snpindels)
                ? data.snpindels.map((s) => deepClone(s))
                : [];

            t.plots = Array.isArray(data.plots)
                ? data.plots.map((p) => plotFactory(p, t))
                : [];

            t.structures = Array.isArray(data.structures)
                ? data.structures.map((s) => {
                    const st = structureFactory(s, t);

                    if (st && s.grid && !st.grid) st.grid = gridFactory(s.grid, t);
                    return st;
                })
                : [];

            t.track_layers = Array.isArray(data.track_layers)
                ? data.track_layers.map((l) => layerFactory(l, t))
                : [];

            return t;
        }

        static fromJSONString(jsonStr, opts) {
            return this.fromJSONObject(jsonStr, opts);
        }

        toJSON(options = {}) {
            const {
                includeSequence = true,
                includeORF = true,
                includeGrid = true,
                includeTrackRef = true,
                includeLayers = true,
                includeStructures = true,
                includePlots = true,
                includeSnpIndels = true,
                includeOligos = true,
                includeAnnotations = true
            } = options;

            const isPrimitive = (v) =>
                v === null || (typeof v !== "object" && typeof v !== "function");

            const sanitize = (value, depth = 0) => {
                if (isPrimitive(value)) return value;

                if (Array.isArray(value)) {
                    return value.map(v => sanitize(v, depth + 1));
                }

                const out = {};
                for (const k of Object.keys(value)) {
                    const v = value[k];

                    if (typeof v === "function" || typeof v === "undefined") continue;

                    if (k === "track" || k === "graph" || k === "ctx" || k === "canvas") continue;
                    out[k] = sanitize(v, depth + 1);
                }
                return out;
            };

            const base = {
                id: this.id,
                name: this.name,
                geneID: this.geneID,
                track_type: this.track_type,
                createdBy: this.createdBy,
                createdDate: this.createdDate,

                xi: this.xi,
                xf: this.xf,
                y: this.y,
                strand: this.strand,
                color: this.color,

                markstart: this.markstart,
                markend: this.markend,
                highlightstart: this.highlightstart,
                highlightend: this.highlightend,

                description: this.description,
                genomicsCoord: this.genomicsCoord,
                showName: this.showName,
                targetPhase: this.targetPhase,
                targetVariant: this.targetVariant,
                hideTrackCoords: this.hideTrackCoords,
                showResizeBar: this.showResizeBar,
                showTrackRefMap: this.showTrackRefMap,

                chr: this.chr,
                species: this.species,
                showSnpIndels: this.showSnpIndels,
                showLayers: this.showLayers,
                showOfftargets: this.showOfftargets,
                showOligoMap: this.showOligoMap,
                showArc: this.showArc,

                transcriptID: this.transcriptID,
                highlightIndex: this.highlightIndex,
                default_track_height: this.default_track_height,
                showAnnotaions: this.showAnnotaions
            };

            if (includeSequence) {
                base.sequence = this.sequence;
            }

            if (includeORF) {

                base.orf = sanitize(this.orf);
                base.orfhash = this.orfhash;
            }

            if (includeGrid && this.grid) {

                const g = this.grid;
                base.grid = this.grid.toJSON()
            }

            if (includeAnnotations && Array.isArray(this.annotations)) {

                base.annotations = this.annotations.map(a => ({
                    type: a.type,
                    name: a.name,
                    xi: Math.floor(a.xi),
                    xf: Math.floor(a.xf),
                    strand: a.strand,
                    gxi: typeof a.gxi !== "undefined" ? Math.floor(a.gxi) : undefined,
                    gxf: typeof a.gxf !== "undefined" ? Math.floor(a.gxf) : undefined,

                    ...sanitize(a.annotations)
                }));
            }

            if (includeOligos && Array.isArray(this.oligos)) {
                base.oligos = this.oligos.map(o => sanitize(o));
            }

            if (includeSnpIndels && Array.isArray(this.snpindels)) {
                base.snpindels = this.snpindels.map(s => sanitize(s));
            }

            if (includePlots && Array.isArray(this.plots)) {
                base.plots = this.plots.map(p => sanitize(p));
            }

            if (includeStructures && Array.isArray(this.structures)) {

                base.structures = this.structures.map(s => ({
                    name: s.name,
                    xi: s.xi,
                    xf: s.xf,
                    strand: s.strand,
                    sequence: s.sequence,
                    grid: s.grid ? {
                        xi: s.grid.xi,
                        yi: s.grid.yi,
                        width: s.grid.width,
                        height: s.grid.height
                    } : undefined,

                    extra: sanitize(s.extra)
                }));
            }

            if (includeLayers && Array.isArray(this.track_layers)) {

                base.track_layers = this.track_layers.map(l => {
                    const safe = sanitize(l);

                    delete safe.track;
                    return safe;
                });
            }

            if (includeTrackRef && this.trackRef) {

                const tr = this.trackRef;
                base.trackRef = {

                    map: Array.isArray(tr.map) ? [...tr.map] : undefined,
                    genomeMap: Array.isArray(tr.genomeMap) ? [...tr.genomeMap] : undefined,

                    start: typeof tr.start !== "undefined" ? tr.start : undefined,
                    end: typeof tr.end !== "undefined" ? tr.end : undefined
                };
            }

            return base;
        }

        toJSONString(options = {}, spacing = 2) {
            return JSON.stringify(this.toJSONObject(options), null, spacing);
        }

        getY(ygraph) {
            console.log('debubg');
            let ycoord = -1 * ((this.grid.Ywc(this.grid.height - ygraph)));
            return ycoord;

        }

        isSelected() {
            return this.showResizeBar;
        }

        getLastPointDate() {
            return null;
        }
        getFirstPointDate() {
            return null;
        }

        calculatePSIForAllExons(polygons) {
            let exons = this.getExonsBetweenTranslationOrTSSAndSTOP();
            if (!exons || exons.length <= 0) {
                return null;
            }
            let psiPolygon = [];

            let transcriptStart = exons[0].xi;
            let transcriptEnd = exons[exons.length - 1].xf;

            let exonindex = 1
            for (let exon of exons) {
                let exonStart = exon.xi;
                let exonEnd = exon.xf;

                let inclusionTotal = 0;
                let exclusionTotal = 0;

                for (let polygon of polygons) {
                    let position = polygon.x;
                    let coverage = polygon.y;

                    if (position >= exonStart && position <= exonEnd) {
                        inclusionTotal += coverage;
                    }

                    else if (position < transcriptStart || position > transcriptEnd) {
                        exclusionTotal += coverage;
                    }
                }

                let totalCoverage = inclusionTotal + exclusionTotal;
                let psi = totalCoverage === 0 ? null : (inclusionTotal / totalCoverage);

                psiPolygon.push({
                    xi: exonStart,
                    xf: exonEnd,
                    psi: psi,
                    index: exonindex
                });
                exonindex++;
            }
            return psiPolygon;
        }
        async cutTrack() {

            let xstart = this.markstart;
            let xend = this.markend;
            if (xend < xstart) {
                return;
            }

            let subTrackLeft = new Track(this.name + "_l", this.xi, xstart - 1, this.y, this.strand);
            let subTrackRight = new Track(this.name + "_r", xend + 1, this.xf, this.y, this.strand);

            const filterSubObjects = (subTrack, start, end) => {
                subTrack.annotations = this.annotations.filter(o => o.xi >= start && o.xf <= end);
                subTrack.oligos = this.oligos.filter(o => o.xi >= start && o.xf <= end);
                subTrack.snpindels = this.snpindels.filter(o => o.xi >= start && o.xf <= end);
                subTrack.structures = this.structures.filter(o => o.xi >= start && o.xf <= end);
                subTrack.track_layers = this.track_layers.filter(o => o.xi >= start && o.xf <= end);
            };
            filterSubObjects(subTrackLeft, this.xi, xstart - 1);
            filterSubObjects(subTrackRight, xend + 1, this.xf);

            subTrackRight.grid.xi = subTrackLeft.grid.xi + subTrackLeft.grid.width;

            return [subTrackLeft, subTrackRight]
        }

        cutSequence__(xi, xf) {
            if (xf < this.xf && xi > this.xi) {
                let fsequence = this.sequence.substring(this.grid.X(xi), this.grid.X(xf));
                let lsequence = this.sequence.substring(this.grid.X(xf) + 1);
                this.sequence = fsequence + lsequence;

                let diff = xf - xi;
                this.xf -= diff;
                this.grid.setxmax(this.xf);
                this.grid.setSize(this.xf - this.xi, -1);
                this.grid.rescale();

                const removeWithinRange = (arr) => {
                    console.log(' -=== ')
                    return arr.filter((o) => {

                        console.log(' --> ' + o.xi)

                        o.xi <= xi || o.xf >= xf
                    });
                };

                this.oligos = removeWithinRange(this.oligos).map(o => {
                    if (o.xi > xf) {
                        o.xi -= diff;
                        o.xf -= diff;
                    } else if (o.xf > xf) {
                        o.xf -= diff;
                        if (o.xf < o.xi) {
                            o.xf = o.xi;
                        }
                    }
                    return o;
                });

                this.annotations = removeWithinRange(this.annotations).map(o => {
                    if (o.xi > xf) {
                        o.xi -= diff;
                        o.xf -= diff;
                    } else if (o.xf > xf) {
                        o.xf -= diff;
                        if (o.xf < o.xi) {
                            o.xf = o.xi;
                        }
                    }
                    return o;
                });

                this.snpindels = removeWithinRange(this.snpindels).map(o => {
                    if (o.xi > xf) {
                        o.xi -= diff;
                        o.xf -= diff;
                    } else if (o.xf > xf) {
                        o.xf -= diff;
                        if (o.xf < o.xi) {
                            o.xf = o.xi;
                        }
                    }
                    return o;
                });

                if (this.structures.length > 0) {

                    this.structures = removeWithinRange(this.structures).map(o => {
                        if (o.xi > xf) {
                            o.xi -= diff;
                            o.xf -= diff;
                        } else if (o.xf > xf) {
                            o.xf -= diff;
                            if (o.xf < o.xi) {
                                o.xf = o.xi;
                            }
                        }
                        return o;
                    });
                }

                if (this.track_layers && this.track_layers.length > 0) {
                    let ntra = [];
                    for (let tr of this.track_layers) {
                        let tls = tr.copyWithinRange(tr.grid.xi, xi);
                        let tls2 = tr.copyWithinRange(xf + 1, tr.grid.xf);
                        ntra.push(tls);
                        ntra.push(tls2);
                    }
                    this.track_layers = ntra.filter(layer => layer);
                }
            }
        }

        setWidth(w) {
            this.grid.width = w;
        }
        setHeight(h) {
            this.grid.height = h;
        }

        cutSequence(xi, xf) {

            xi = Math.floor(xi)
            xf = Math.floor(xf)

            if (xf < this.xf && xi > this.xi) {
                let cutoutsequence = this.sequence.substring(Math.floor(this.grid.X(xi)), Math.floor(this.grid.X(xf)));
                let fsequence = this.sequence.substring(0, Math.floor(this.grid.X(xf)));
                let lsequence = this.sequence.substring(Math.floor(this.grid.X(xf)) + 1);
                this.sequence = fsequence + lsequence;

                let diff = xf - xi;
                this.xf -= diff;
                this.grid.setxmax(this.xf);
                this.grid.setSize(this.xf - this.xi, this.grid.height);
                this.grid.rescale();
                for (let o of this.oligos) {
                    if (o.xi > xf) {
                        o.xi -= diff;
                        o.xf -= diff;
                    } else if (o.xf > xf) {
                        o.xf -= diff;
                        if (o.xf < o.xi) {
                            o.xf = o.xi;
                        }
                    }
                }
                for (let o of this.annotations) {
                    if (o.xi > xf) {
                        o.xi -= diff;
                        o.xf -= diff;
                    } else if (o.xf > xf) {
                        o.xf -= diff;
                        if (o.xf < o.xi) {
                            o.xf = o.xi;
                        }
                    }
                }
                for (let o of this.snpindels) {
                    if (o.xi > xf) {
                        o.xi -= diff;
                        o.xf -= diff;
                    } else if (o.xf > xf) {
                        o.xf -= diff;
                        if (o.xf < o.xi) {
                            o.xf = o.xi;
                        }
                    }
                }
                if (this.structures.length > 0) {
                }

                if (this.track_layers && this.track_layers.length > 0) {

                    let ntra = []
                    for (let tr of this.track_layers) {

                        let tls = tr.copyWithinRange(tr.grid.xi, xi)
                        let tls2 = tr.copyWithinRange(xf + 1, tr.grid.xf)

                        ntra.push(tls)
                        ntra.push(tls2)
                    }
                    this.track_layers = []

                    this.track_layers.push(...ntra)

                }

                if (this.orf) {
                    this.generateORF();
                }
            }
        }

        getORFPeptide() {
            let aa = '';
            for (let oor of this.orf.cdsi) {
                for (let oor of this.orf.cdsi) {
                    aa += oor.aa
                }

            }
            return aa;
        }

        setTrackCoordinates(start, end) {
            if (end < 0) {
                this.grid.height = this.default_track_height;
                this.grid.xi = start;
                this.grid.rescale();

            } else {
                this.grid.height = this.default_track_height;
                this.grid.xi = start;
                this.grid.width = end - start;
                this.grid.rescale();
            }
        }

        addLayer(t) {
            this.track_layers.push(t)
        }

        getIntrons(offset) {
            if (!offset) {
                offset = 0;
            }
            let sorted_annotations = this.annotations;
            if (this.strand > 0) {
                sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
            }
            else {
                sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });
            }
            let exons = []
            for (let a of sorted_annotations) {
                if (a.type === 'Exon') {
                    exons.push(a)
                }
            }
            let index = 1;
            let introns = []
            let prev = null;
            let smatch = []
            for (let s of exons) {
                if (prev) {
                    let ai = prev.xf - offset;
                    let af = s.xi + offset;
                    if (this.strand < 0) {
                        ai = s.xf - offset;
                        af = prev.xi + offset;
                    }
                    let seq = this.getSequenceRange(ai, af);
                    introns.push({
                        index: index++,
                        xi: ai,
                        xf: af,
                        seq: seq
                    })
                    prev = s;

                } else {
                    prev = s;
                }
            }
            return introns;
        }

        highlightIntron(x) {
            this.markstart = -1;
            this.markend = -1;
            let pex = null;
            let sorted_annotations = this.annotations;
            sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
            for (let a of sorted_annotations) {
                if (a.type === 'Exon') {
                    if (!pex) {
                        pex = a;
                    } else {
                        if (pex.xf < x && a.xi > x) {
                            this.markstart = pex.xf;
                            this.markend = a.xi;

                        }
                    }
                    pex = a;
                }
            }
        }

        highlightAnnotation(x) {
            this.markstart = -1;
            this.markend = -1;
            let sorted_annotations = this.annotations;
            sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
            for (let a of sorted_annotations) {
                if (a.xi < x && a.xf > x) {
                    this.markstart = a.xi;
                    this.markend = a.xf;
                }
            }
        }

        getSequences(annotation) {
            let seq = ''
            let sorted_annotations = this.annotations;
            sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
            let seqindex = [];
            let sindex = 0;

            for (let a of sorted_annotations) {
                if (a.type === annotation) {
                    let tt = this.sequence.substring(Math.floor(a.xi - this.xi), Math.floor(a.xf - this.xi) + 1);
                    seq += tt;
                }
            }
            return seq;
        }

        findSTOPCodonIndex() {
            let seq = ''
            let sorted_annotations = this.annotations;
            let startIndex = -1;
            let endIndex = -1;

            if (this.strand > 0)
                sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
            else
                sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });

            for (let an of sorted_annotations) {
                if (an.type.toLowerCase() === 'translation') {
                    startIndex = an.xi;
                    endIndex = an.xf;
                }
            }
            for (let an of sorted_annotations) {
                if (an.type.toLowerCase() === 'translation' || an.type.toLowerCase() === 'transcription') {
                    startIndex = an.xi;
                    endIndex = an.xf;
                }
            }
            if (startIndex < 0) {
                for (let an of sorted_annotations) {
                    if (an.type.toLowerCase() === 'tss') {
                        startIndex = an.xi;
                    }
                }
            }

            if (endIndex < 0) {
                for (let an of sorted_annotations) {
                    if (an.type.toLowerCase() === 'stop') {
                        endIndex = an.xf;
                    }
                }
            }

            let seqindex = [];
            let cdsIndex = []
            let sindex = 0;
            let codon_i = 1;
            let codon_ii = 0;
            let base_i = 1;
            let codon_value = ''
            let cds_i = false;

            if (this.strand > 0) {
                sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
                for (let a of sorted_annotations) {
                    if (a.type === "Exon") {
                        let ai = a.xi;
                        let af = a.xf;
                        if (startIndex >= a.xi && startIndex < a.xf) {
                            ai = startIndex;
                            cds_i = true;
                        }
                        if (endIndex >= a.xi && endIndex < a.xf) {
                            af = endIndex;
                            let tt = this.sequence.substring(Math.floor(ai - this.xi),
                                Math.floor(af - this.xi) + 1);
                            for (let gene_index = 0; gene_index < tt.length; gene_index++) {
                                codon_value += tt[gene_index]
                                let datav = {
                                    'codon_index': codon_i,
                                    'ci': codon_ii,
                                    'index': gene_index + ai,
                                    'codon': codon_value
                                }
                                cdsIndex.push(datav)
                                codon_ii++;
                                if (base_i % 3 === 0) {
                                    for (let ci of cdsIndex) {
                                        if (ci.codon_index === codon_i) {
                                            ci.codon = codon_value
                                        }
                                    }
                                    codon_ii = 0;
                                    codon_i++;
                                    codon_value = ''
                                }
                                base_i++;
                            }
                            seq += tt;
                            cds_i = false
                        }
                        if (cds_i) {
                            let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
                            for (let gene_index = 0; gene_index < tt.length; gene_index++) {

                                codon_value += tt[gene_index]
                                cdsIndex.push({
                                    'codon_index': codon_i,
                                    'ci': codon_ii,
                                    'index': gene_index + ai,
                                    'codon': codon_value
                                })

                                codon_ii++;
                                if (base_i % 3 === 0) {
                                    for (let ci of cdsIndex) {
                                        if (ci.codon_index === codon_i) {
                                            ci.codon = codon_value
                                        }
                                    }
                                    codon_i++;
                                    codon_ii = 0;
                                    codon_value = ''
                                }
                                base_i++;
                            }
                            seq += tt;
                        }
                    }
                }
                for (let o of cdsIndex) {
                    let aa = codon((o.codon))
                    if (aa == 'STOP') {
                        return o;
                    }
                    o.aa = aa;
                }
                this.orf = { 'sequence': seq, 'cdsi': cdsIndex };
                this.orfhash = compressJson(this.orf);

            } else {
                sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });
                for (let a of sorted_annotations) {
                    if (a.type === "Exon") {
                        let ai = a.xi;
                        let af = a.xf;

                        if (startIndex >= a.xi && startIndex < a.xf) {
                            af = startIndex - 1;
                            cds_i = true;
                        }
                        if (endIndex >= a.xi && endIndex < a.xf) {
                            ai = endIndex;
                            let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
                            for (let gene_index = tt.length - 1; gene_index >= 0; gene_index--) {
                                codon_value += tt[gene_index]
                                cdsIndex.push({
                                    'codon_index': codon_i,
                                    'ci': codon_ii,
                                    'index': gene_index + ai,
                                    'codon': codon_value
                                })
                                codon_ii++;
                                if (base_i % 3 === 0) {
                                    for (let ci of cdsIndex) {
                                        if (ci.codon_index === codon_i) {
                                            ci.codon = codon_value
                                        }
                                    }
                                    codon_ii = 0;
                                    codon_i++;
                                    codon_value = ''
                                }
                                base_i++;
                            }
                            seq += tt;
                            cds_i = false
                        }
                        if (cds_i) {
                            let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
                            for (let gene_index = tt.length - 1; gene_index >= 0; gene_index--) {

                                codon_value += tt[gene_index]
                                cdsIndex.push({
                                    'codon_index': codon_i,
                                    'ci': codon_ii,
                                    'index': gene_index + ai,
                                    'codon': codon_value
                                })

                                codon_ii++;
                                if (base_i % 3 === 0) {
                                    for (let ci of cdsIndex) {
                                        if (ci.codon_index === codon_i) {
                                            ci.codon = codon_value
                                            let aa = codon(codon_value);
                                            if (aa === 'STOP') {
                                                this.add(new Annotation('STOP', 'STOP', ci.index, ci.index + 3))
                                                this.removeAnnotationByType('translation')
                                                this.add(new Annotation('Translation', 'Translation', startIndex, ci.index + 3))

                                                cds_i = false;
                                            }
                                        }
                                    }
                                    codon_i++;
                                    codon_ii = 0;
                                    codon_value = ''
                                }
                                base_i++;
                            }
                            seq += tt;
                        }
                    }
                }
                for (let o of cdsIndex) {
                    let aa = codon((o.codon))
                    if (aa == 'STOP') {
                        return o;
                    }
                    o.aa = aa;
                }
                this.orf = { 'sequence': seq, 'cdsi': cdsIndex };
                this.orfhash = compressJson(this.orf);

            }
        }

        generateORF() {
            this.removeAnnotationByType('STOP')
            this.orf = null;
            let seq = ''

            this.removeAnnotationByType('translation')

            let sorted_annotations = this.annotations;
            if (this.strand >= 0)
                sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
            else
                sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });

            let startIndex = -1;
            let endIndex = -1;
            for (let an of sorted_annotations) {
                if (an.type.toLowerCase() === 'translation') {
                    startIndex = an.xi;
                    endIndex = an.xf;
                }
            }

            if (startIndex > 0 && endIndex < 0) {
                let endI = this.findSTOPCodonIndex();
                endIndex = endI.index;
                this.add(new Annotation('TSS', 'TSS', startIndex, startIndex + 2))
                this.add(new Annotation('STOP', 'STOP', endIndex, endIndex + 2))
                this.add(new Annotation('Translation', 'Translation', startIndex, endIndex))

            } else
                if (startIndex < 0 && endIndex < 0) {
                    this.removeAnnotationByType('translation')
                    for (let an of sorted_annotations) {
                        if (this.strand < 0) {
                            if (an.type.toLowerCase() === 'tss') {
                                startIndex = an.xf;
                            } else if (an.type.toLowerCase() === 'stop') {
                                endIndex = an.xi;
                            }
                        } else {
                            if (an.type.toLowerCase() === 'tss') {
                                startIndex = an.xi;
                            } else if (an.type.toLowerCase() === 'stop') {
                                endIndex = an.xf;
                            }
                        }
                    }
                    this.add(new Annotation('Translation', 'Translation', startIndex, endIndex))
                }

            let cdsIndex = []
            let codon_i = 0;
            let codon_ii = 0;
            let base_i = 1;
            let codon_value = ''
            let cds_i = false;
            if (this.strand >= 0) {
                sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
                for (let a of sorted_annotations) {
                    if (a.type === "Exon") {
                        let ai = a.xi;
                        let af = a.xf;

                        if (startIndex >= a.xi && startIndex < a.xf) {
                            ai = startIndex;
                            cds_i = true;
                        }
                        if (endIndex >= a.xi && endIndex < a.xf) {
                            af = endIndex;
                            let tt = this.sequence.substring(Math.floor(ai - this.xi),
                                Math.floor(af - this.xi) + 1);

                            for (let gene_index = 0; gene_index < tt.length; gene_index++) {
                                codon_value += tt[gene_index]
                                cdsIndex.push({
                                    'codon_index': codon_i,
                                    'ci': codon_ii,
                                    'index': gene_index + ai,
                                    'codon': codon_value
                                })
                                codon_ii++;
                                if (base_i % 3 === 0) {
                                    for (let ci of cdsIndex) {
                                        if (ci.codon_index === codon_i) {
                                            ci.codon = codon_value
                                        }
                                    }
                                    codon_ii = 0;
                                    codon_i++;
                                    codon_value = ''
                                }
                                base_i++;
                            }
                            seq += tt;
                            cds_i = false
                        }
                        if (cds_i) {
                            let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
                            let stop = false;
                            for (let gene_index = 0; gene_index < (tt.length); gene_index++) {
                                codon_value += tt[gene_index]
                                cdsIndex.push({
                                    'codon_index': codon_i,
                                    'ci': codon_ii,
                                    'index': gene_index + ai,
                                    'codon': codon_value
                                })
                                codon_ii++;
                                if (base_i % 3 === 0) {
                                    for (let ci of cdsIndex) {
                                        if (ci.codon_index === codon_i) {
                                            ci.codon = codon_value
                                            let aa = codon(codon_value);
                                            if (aa.toLowerCase() === 'stop') {
                                                this.add(new Annotation('STOP', 'STOP', ci.index, ci.index + 3))
                                                this.removeAnnotationByType('translation')
                                                this.add(new Annotation('Translation', 'Translation', startIndex, ci.index + 3))
                                                cds_i = false;
                                                gene_index = tt.length;

                                            }
                                        }
                                    }
                                    codon_i++;
                                    codon_ii = 0;
                                    codon_value = ''
                                }
                                base_i++;
                            }
                            seq += tt;
                        }
                    }
                }
                for (let o of cdsIndex) {
                    let aa = codon((o.codon))
                    o.aa = aa;
                }
                this.orf = { 'sequence': seq, 'cdsi': cdsIndex };
                this.orfhash = compressJson(JSON.stringify(this.orf));

            } else {

                sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });
                for (let a of sorted_annotations) {
                    if (a.type === "Exon") {
                        let ai = a.xi;
                        let af = a.xf;
                        if (startIndex > a.xi && startIndex <= a.xf) {
                            af = startIndex - 1;
                            cds_i = true;
                        }
                        if (endIndex > a.xi && endIndex <= a.xf) {
                            ai = endIndex;
                            let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
                            for (let gene_index = tt.length - 1; gene_index >= 0; gene_index--) {
                                codon_value += tt[gene_index]

                                cdsIndex.push({
                                    'codon_index': codon_i,
                                    'ci': codon_ii,
                                    'index': gene_index + ai,
                                    'codon': codon_value
                                })
                                codon_ii++;
                                if (base_i % 3 === 0) {
                                    for (let ci of cdsIndex) {
                                        if (ci.codon_index === codon_i) {
                                            ci.codon = codon_value
                                            if (aa.toLowerCase() === 'stop') {
                                                this.add(new Annotation('STOP', 'STOP', ci.index, ci.index + 3))
                                                this.removeAnnotationByType('translation')
                                                this.add(new Annotation('Translation', 'Translation', startIndex, ci.index + 3))
                                                endIndex = ci.index + 3;
                                                gene_index = -1;
                                                cds_i = false;
                                            }

                                        }
                                    }
                                    codon_ii = 0;
                                    codon_i++;
                                    codon_value = ''
                                }
                                base_i++;
                            }
                            seq += tt;
                            cds_i = false
                        }
                        if (cds_i) {
                            let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
                            let stop = false;

                            for (let gene_index = tt.length - 1; gene_index >= 0; gene_index--) {

                                codon_value += tt[gene_index]
                                cdsIndex.push({
                                    'codon_index': codon_i,
                                    'ci': codon_ii,
                                    'index': gene_index + ai,
                                    'codon': codon_value
                                })

                                codon_ii++;
                                if (base_i % 3 === 0) {
                                    for (let ci of cdsIndex) {
                                        if (ci.codon_index === codon_i) {
                                            ci.codon = codon_value

                                            let aa = codon(codon_value);
                                            if (aa.toLowerCase() === 'stop') {
                                                this.add(new Annotation('STOP', 'STOP', ci.index, ci.index + 3))
                                                this.removeAnnotationByType('translation')
                                                this.add(new Annotation('Translation', 'Translation', startIndex, ci.index + 3))
                                                endIndex = ci.index + 3;
                                                gene_index = -1;
                                                cds_i = false;
                                            }
                                        }
                                    }
                                    codon_i++;
                                    codon_ii = 0;
                                    codon_value = ''
                                }
                                base_i++;
                            }
                            seq += tt;
                        }
                    }
                }
                for (let o of cdsIndex) {
                    let aa = codon((o.codon))
                    o.aa = aa;
                }
                this.orf = { 'sequence': seq, 'cdsi': cdsIndex };
                this.orfhash = compressJson(JSON.stringify(this.orf));

            }

            let expell = []
            for (let a of this.annotations) {
                if (a.type.toLowerCase() === 'stop') {
                    let afound = false;
                    let exons = this.getExons();

                    for (let e of exons) {
                        if (e.xi <= a.xi && e.xf > a.xf) {
                            afound = true;
                        }
                    }
                    if (!afound) {
                        expell.push(a)
                    }
                }
            }
            let isEqual = (obj1, obj2) => {
                return JSON.stringify(obj1) === JSON.stringify(obj2);
            }
            this.annotations = this.annotations.filter(obj => !expell.find(toRemove => isEqual(obj, toRemove)));

            return this.orf;
        }

        getTranslation() {
            for (let a of this.annotations) {
                if (a.type === 'Translation') {
                    return a;
                }
            }
            return null;
        }

        getExons() {
            let temp = []
            for (let a of this.annotations) {
                if (a.type === 'Exon') {
                    temp.push(a)
                }
            }
            return temp;
        }

        // Is this track's sequence the SPLICED transcript (mRNA / cDNA), or the full
        // intron-containing span (pre-mRNA)?
        //
        // It decides how a data layer's coordinates reach the canvas:
        //   mRNA      positions are transcript-relative, so they must be mapped back out
        //             through the exons and split at every intron boundary
        //   pre-mRNA  positions are already linear along the track, so they are placed
        //             directly -- running them through the exons would move every one
        //
        // Told apart by length: compare the sequence against the summed exon length and
        // against the genomic span, and take whichever it is closer to. The same test was
        // already inline in buildCdna(); it lives here now so the loaders and the renderer
        // cannot drift apart on what counts as spliced.
        isSplicedTranscript() {
            try {
                const seqLen = (this.sequence && this.sequence.length) || 0;
                if (!seqLen) return false;
                const exons = this.getExons() || [];
                if (!exons.length) return false;   // nothing to splice through
                const totalExonLen = exons.reduce((t, a) => t + Math.max(0, Math.floor(a.xf - a.xi)), 0);
                const spanLen = Math.abs(Math.floor(this.xf - this.xi));
                if (!totalExonLen || !spanLen) return false;
                return Math.abs(seqLen - totalExonLen) <= Math.abs(seqLen - spanLen);
            } catch (e) { return false; }
        }
        getAnnotations(annotation_type) {
            let temp = []
            for (let a of this.annotations) {
                if (a.type === annotation_type) {
                    temp.push(a)
                }
            }
            return temp;
        }

        getExonsBetweenTranslationOrTSSAndSTOP() {

            let start = null;
            let end = null;

            let translationAnnotation = this.annotations.find(annotation => annotation.type === "Translation");

            if (translationAnnotation) {

                start = translationAnnotation.xi;
                end = translationAnnotation.xf;
            } else {

                let tssAnnotation = null;
                let stopAnnotation = null;

                for (let annotation of this.annotations) {
                    if (annotation.type === "TSS") {
                        tssAnnotation = annotation;
                    } else if (annotation.type === "STOP") {
                        stopAnnotation = annotation;
                    }
                }

                if (!tssAnnotation || !stopAnnotation) {
                    console.warn("Translation, TSS, or STOP annotation not found.");
                    return [];
                }

                start = tssAnnotation.xi;
                end = stopAnnotation.xf;
            }

            let exons = this.annotations.filter(annotation => {
                if (annotation.type === "Exon") {
                    if (this.strand >= 0) {

                        return annotation.xi >= start && annotation.xf <= end;
                    } else {

                        return annotation.xf <= start && annotation.xi >= end;
                    }
                }
                return false;
            });

            return exons;
        }

        getCodon(codon_index) {
            let bindex = +codon_index;
            let sorted_annotations = this.annotations;
            sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
            let codons = []
            let codon = ''
            let start = false;
            let index = 0;
            let gstart = -1;
            let gend = -1;

            for (let a of sorted_annotations) {
                if (a.type === 'Exon') {
                    let tt = this.sequence.substring(Math.floor(a.xi - this.xi), Math.floor(a.xf - this.xi) + 2);

                    let start_index = 0;
                    if ((!start) && tt.indexOf('ATG') >= 0) {
                        start = true;
                        start_index = tt.indexOf('ATG')
                    }

                    for (let s = start_index; s < tt.length - 1; s++) {
                        codon = codon.trim();
                        if (codon.length > 2) {
                            codon = '';
                            gend = -1;
                        }
                        codon += tt.substring(s, s + 1);

                        if (codon && codon.length === 1) {
                            gstart = a.xi + s;
                        }
                        if (codon.length === 3) {
                            gend = a.xi + s;
                        }
                        if (start) {
                            if (codon.length === 3) {
                                codons[index++] = { 'codon': codon, 'start': gstart, 'end': gend };
                            }
                        } else
                            if (codon.length === 3 && (codon === 'TAA' || codon === 'TAG' || codon === 'TGA')) {
                                start = false;
                            }
                    }
                }

            }

            return codons[(codon_index)]
        }

        getStartCodonIndex() {
            let sorted_annotations = this.annotations;
            if (this.strand < 0) {
                sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });
            }
            else
                sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
            for (let a of sorted_annotations) {

                if (a.type === "Translation") {
                    if (this.strand < 0)
                        return a.xf - 2;
                    else
                        return a.xi;
                }

            }
            return -1;
        }

        copyLayers() {
            let copyTrackLayer = (layer) => {
                if (layer instanceof AttributionLayer) {
                    let obj = layer;
                    let l = new AttributionLayer(
                        obj.name, obj.xmin, obj.ymin, obj.xmax, obj.ymax,
                        obj.attribution_type, obj.attribution_site, obj.window, obj.track)
                    Object.assign(l, layer);
                    l.name = layer.name + '*'
                    return l;

                } else if (layer instanceof AttributionSushimiLayer) {
                    let l = Object.assign(new AttributionSushimiLayer(), layer)
                    l.name = layer.name + '*'
                    return l;

                } else {
                    let l = Object.assign(new TrackLayer(), layer)
                    l.name = layer.name + '*'
                    return l;
                }
            }
            let tl = this.track_layers.map(layer => copyTrackLayer(layer))
            return tl;
        }

        getNearestAnnotation(type, x) {

            let nearestLine = null;
            let minDistance = Infinity;
            let selected = null;
            let i = 0;
            let sorted_annotations = this.annotations
            if (this.strand > 0) {
                sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
            }
            else
                sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });

            for (let a of sorted_annotations) {
                if (a.type === type) {
                    if (a.xi <= x && a.xf > x) {
                        return a;
                    }
                    let distanceToStart = Math.abs(a.xi - x);
                    let distanceToEnd = Math.abs(a.xf - x);
                    let closestDistance = Math.min(distanceToStart, distanceToEnd);

                    if (closestDistance < minDistance) {
                        minDistance = closestDistance;
                        selected = a;
                    }

                }
            }
            return selected;
        }

        getNextExon(x) {
            let type = 'Exon'
            let a = this.getNearestAnnotation(type, x);
            if (!a) {
                return null;
            }
            let sorted_annotations = this.annotations
            if (this.strand > 0) {
                sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
            }
            else
                sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });

            let found = false;
            let index = 0;
            for (let s of sorted_annotations) {
                if (found && s.type == 'Exon') {
                    return s;
                }
                if (s === a)
                    found = true;
            }
            return null;
        }

        getNearestAA(x) {
            if (this.orf && this.orf.cdsi) {
                for (let oor of this.orf.cdsi) {
                    if (Math.abs(oor.index - x) <= 1) {
                        return oor;
                    }
                }
            } else {
                this.generateORF();
                return this.getNearestAA(x);
            }

            return null;
        }

        ORFIndexToGenomicIndex(orfindex) {
            this.generateORF();
            if (this.orf && this.orf.cdsi) {
                for (let oor of this.orf.cdsi) {
                    if (oor.codon_index === orfindex) {
                        return oor.index;
                    }
                }
            }
            return -1;
        }

        getAllIndexes(arr, val) {
            var indexes = [], i = -1;
            while ((i = arr.indexOf(val, i + 1)) != -1) {
                indexes.push(i);
            }
            return indexes;
        }
        getCodingSequences(t) {
            let letc = []
            let indexes = getAllIndexes(letc, "AUG");
            return index;
        }
        genomicToCodingIndex(c) {
            let annotation = null;
            let sorted_annotations = this.annotations;
            sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
            for (let a of sorted_annotations) {
                if (a.type === "Translation") {
                    annotation = a;
                }
            }
            if (!annotation)
                throw ("The Translation (annotation type == Translation) annotation is not defined. ")

            if (this.strand >= 0) {
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

                for (let a of sorted_annotations) {
                    if (a.type === "Exon") {

                        if (a.xf < annotation.xi && a.xi > annotation.xi) {
                            let increment = a.xi - annotation.xi;
                            if (c <= increment) {
                                return Math.floor(annotation.xi) - (c);
                            } else {
                                totalCount += increment;
                            }
                        }
                        else {
                            let increment = Math.abs(Math.floor(a.xi) - Math.floor(a.xf))

                            totalCount += increment;
                        }
                        if (totalCount >= c) {
                            return Math.floor(a.xi) - totalCount - c - 1;

                        }
                    }
                }
            }
            return annotation.xi;
        }

        getCDS() {
            let reverseString = (str) => {
                return str.split("").reverse().join("");
            }
            let annotation = null;
            let sorted_annotations = this.annotations;
            sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
            let sequence = '';
            for (let a of sorted_annotations) {
                if (a.type === "Translation") {
                    annotation = a;
                    sequence = this.sequence.substring(Math.floor(a.xi - this.xi), Math.floor(a.xf + 1 - this.xi));
                    if (this.strand < 0) {
                        sequence = reverseString(sequence)
                    }
                }
            }
            let spliced = '';
            let junktions = []
            if (this.strand >= 0) {

                for (let a of sorted_annotations) {
                    if (a.type === "Exon") {
                        if (a.xi < annotation.xi && a.xf > annotation.xi) {
                            let si = Math.floor(annotation.xi - this.xi);
                            let sf = Math.floor(a.xf + 1 - this.xi);
                            spliced += this.sequence.substring(si, sf)
                            junktions.push(spliced.length)
                        } else if (a.xi < annotation.xf && a.xf > annotation.xf) {
                            spliced += this.sequence.substring(Math.floor(a.xi - this.xi), Math.floor(annotation.xf + 1 - this.xi))
                            junktions.push(spliced.length)
                        } else
                            if (a.xi > annotation.xi && a.xf < annotation.xf) {
                                spliced += this.sequence.substring(a.xi - this.xi, a.xf + 1 - this.xi)
                                junktions.push(spliced.length)
                            }
                    }
                }
            } else {
                for (let a of sorted_annotations) {
                    if (a.type === "Exon") {
                        if (a.xi < annotation.xi && a.xf > annotation.xi) {
                            spliced += this.sequence.substring(Math.floor(annotation.xi - this.xi), Math.floor(a.xf - this.xi))
                            junktions.push(spliced.length)

                        } else
                            if (a.xi < annotation.xf && a.xf > annotation.xf) {
                                spliced += this.sequence.substring(Math.floor(a.xi - this.xi), Math.floor(annotation.xf + 1 - this.xi))
                                junktions.push(spliced.length)

                            } else
                                if (a.xi > annotation.xi && a.xf < annotation.xf) {
                                    spliced += this.sequence.substring(Math.floor(a.xi - this.xi), Math.floor(a.xf - this.xi))
                                    junktions.push(spliced.length)

                                }
                    }
                }
                spliced = reverseString(spliced)

            }

            if (annotation === null) {
                return {};
            }

            return {
                'sequence': spliced,
                'annotation': annotation,
                'junctions': junktions
            }
        }

        getStopCodonIndex() {
            let sorted_annotations = this.annotations;
            if (this.strand < 0) {
                sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });
            }
            else
                sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
            for (let a of sorted_annotations) {

                if (a.type === "Translation") {
                    if (this.strand < 0)
                        return a.xi;
                    else
                        return a.xf;
                }

            }
            return -1;
        }

        getStructure(x, y) {
            let slist = []
            for (let s of this.structures) {
                if (x >= s.grid.xi && x < s.grid.xi + s.grid.width &&
                    y <= s.grid.yi + (s.grid.height) && y > s.grid.yi) {
                    slist.push(s);
                }
            }
            return slist;
        }

        createSecondaryStructure(xi, s, name, em) {
            let track = new RNASecondaryStructure(name, xi, this.grid.screenWidth(s.length), s, this.strand, this);
            track.grid.xi = xi;
            track.calculateSecondaryStructure(em);
            this.structures.push(track)
            return track;
        }

        parseMutationSyntax(mutation) {
            const regex = /^c\.(\d+)([-+]\d+)?([A-Z])>([A-Z])$/;
            const match = mutation.match(regex);
            if (match) {
                return {
                    type: 'SNP',
                    position: parseInt(match[1], 10),
                    offset: match[2] ? parseInt(match[2], 10) : 0,
                    originalNucleotide: match[3],
                    newNucleotide: match[4]
                };
            } else {

                const parts = mutation.split('delins');
                if (parts) {
                    const positions = parts[0].substring(1).split('_');
                    const newSequence = parts[1];
                    const startPosition = parseInt(positions[0].substring(1));
                    const endPosition = parseInt(positions[1]);
                    const originalSequence = this.sequence.substring(startPosition, endPosition - startPosition);
                    return {
                        type: 'delins',
                        position: [startPosition, endPosition],
                        originalNucleotide: originalSequence,
                        newNucleotide: newSequence
                    };
                } else {
                    throw new Error('Invalid mutation syntax');
                }
            }
        }

        generateTranslationAnnotation() {

        }

        codingToGenomic(coding) {
            let exonIndex = 0;
            let stopIndex = 0;
            let cstart = 0;
            let t = null;
            for (let a of this.annotations) {
                if (a.type === 'Translation') {
                    stopIndex = Math.abs(a.gxf - a.gxi);
                    t = a;
                }
            }

            if (!t) {
                generateTranslationAnnotation();
            }

            let sorted_annotations = this.annotations;
            if (this.strand > 0)
                sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
            else
                sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });

            for (let a of sorted_annotations) {

                if (a.type === 'Exon') {
                    a.gxi = Math.floor(a.gxi)
                    a.gxf = Math.floor(a.gxf)
                    a.xi = Math.floor(a.xi)
                    a.xf = Math.floor(a.xf)
                    if (this.strand < 0) {
                        if (a.xf > t.xi && a.xi < t.xi) {
                            cstart = t.xi;
                            exonIndex = 1;
                            for (let _i = t.xi - 1; _i >= a.xi; _i--) {

                                if (exonIndex === coding)
                                    return _i;
                                exonIndex++;
                                if (exonIndex > stopIndex)
                                    break;

                            }

                        }
                        else if (t.xf < a.xf && t.xf > a.xi) {
                            for (let _i = a.xf; _i >= t.xf; _i--) {

                                if (exonIndex === coding)
                                    return _i;

                                exonIndex++;
                                if (exonIndex > stopIndex)
                                    break;

                            }
                        } else {
                            for (let _i = a.xf; _i >= a.xi; _i--) {

                                if (exonIndex === coding)
                                    return _i;

                                exonIndex++;
                                if (exonIndex > stopIndex)
                                    break;

                            }
                        }
                    }
                    else {

                        if (a.xf > t.xi && a.xi < t.xi) {
                            exonIndex = 1;
                            for (let _i = t.xi; _i <= a.xf; _i++) {

                                if (exonIndex === coding)
                                    return _i;

                                exonIndex++;
                                if (exonIndex > stopIndex)
                                    break;
                            }
                        } else if (t.xf < a.xf && t.xf > a.xi) {
                            for (let _i = a.xi; _i <= t.xf; _i++) {

                                if (exonIndex === coding)
                                    return _i;

                                exonIndex++;
                                if (exonIndex > stopIndex)
                                    break;

                            }
                        } else {
                            for (let _i = a.xi; _i <= a.xf; _i++) {

                                if (exonIndex === coding)
                                    return _i;

                                exonIndex++;
                                if (exonIndex > stopIndex)
                                    break;

                            }
                        }

                    }
                }
            }
        }

        getGenomicIndexForCDNAIndex(cdnaIndex) {
            let mut = this.parseMutationSyntax(cdnaIndex)

            if (mut && mut.type === 'SNP') {
                mut.position = parseInt(mut.position)
                mut.offset = parseInt(mut.offset)
                let seq = ''
                let sorted_annotations = this.annotations;
                if (this.strand > 0)
                    sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
                else
                    sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });
                let startIndex = -1;
                let endIndex = -1;
                for (let an of sorted_annotations) {
                    if (an.type.toLowerCase() === 'translation') {
                        startIndex = an.xi;
                        endIndex = an.xf;
                    }
                }
                let cdsIndex = []
                let codon_i = 0;
                let codon_ii = 0;
                let base_i = 1;
                let codon_value = ''
                let cds_i = false;
                if (this.strand > 0) {
                    sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
                    for (let a of sorted_annotations) {
                        if (a.type === "Exon") {
                            let ai = a.xi;
                            let af = a.xf;

                            if (startIndex >= a.xi && startIndex < a.xf) {
                                ai = startIndex;
                                cds_i = true;
                            }
                            if (endIndex >= a.xi && endIndex < a.xf) {
                                af = endIndex;
                                let tt = this.sequence.substring(Math.floor(ai - this.xi),
                                    Math.floor(af - this.xi) + 1);
                                for (let gene_index = 0; gene_index < tt.length; gene_index++) {
                                    let geneIndex = gene_index + ai;
                                    if (base_i === mut.position) {
                                        return geneIndex + mut.offset;
                                    }
                                    base_i++;
                                }
                                seq += tt;
                                cds_i = false
                            }
                            if (cds_i) {
                                let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
                                for (let gene_index = 0; gene_index < tt.length; gene_index++) {
                                    let geneIndex = gene_index + ai;
                                    if (base_i === mut.position) {
                                        return geneIndex + mut.offset;
                                    }
                                    base_i++;
                                }
                                seq += tt;
                            }
                        }
                    }
                } else {
                    sorted_annotations = sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });
                    for (let a of sorted_annotations) {
                        if (a.type === "Exon") {
                            let ai = a.xi;
                            let af = a.xf;
                            if (startIndex > a.xi && startIndex <= a.xf) {
                                af = startIndex - 1;
                                cds_i = true;
                            }
                            if (endIndex > a.xi && endIndex <= a.xf) {
                                ai = endIndex;
                                let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
                                for (let gene_index = tt.length - 1; gene_index >= 0; gene_index--) {
                                    codon_value += tt[gene_index]
                                    let geneIndex = gene_index + ai;
                                    if (base_i === mut.position) {

                                        return {
                                            type: 'SNP',
                                            start: geneIndex + mut.offset
                                        };

                                    }
                                    base_i++;
                                }
                                seq += tt;
                                cds_i = false
                            }
                            if (cds_i) {
                                let tt = this.sequence.substring(Math.floor(ai - this.xi), Math.floor(af - this.xi) + 1);
                                for (let gene_index = tt.length - 1; gene_index >= 0; gene_index--) {
                                    codon_value += tt[gene_index]
                                    let geneIndex = gene_index + ai;
                                    if (base_i === mut.position) {
                                        return {
                                            type: 'SNP',
                                            start: geneIndex + mut.offset
                                        };

                                    }

                                    base_i++;
                                }
                                seq += tt;
                            }
                        }
                    }
                }
            } else if (mut && mut.type === 'delins') {
                let positions = mut;
                let g = {
                    type: 'delins',
                    start: this.codingToGenomic(mut.position[0] - 1),
                    end: this.codingToGenomic(mut.position[1])
                }
                return g;
            }
        }

        getGenomicStart() {

            let lowestGxi = Number.POSITIVE_INFINITY;
            this.annotations.forEach(annotation => {
                const gxi = annotation.gxi;
                if (gxi !== undefined && gxi < lowestGxi) {
                    lowestGxi = gxi;
                }
            });
            return lowestGxi;
        }

        getGenmoicEnd() {

            let largestGxf = Number.NEGATIVE_INFINITY;
            this.annotations.forEach(annotation => {
                const gxf = annotation.gxf;
                if (gxf !== undefined && gxf > largestGxf) {
                    largestGxf = gxf;
                }
            });
            return largestGxf;
        }

        createTrackFromAnnotation(annotation) {
            let seq = ''
            let _annotations = [];
            let _annotation_tag = annotation;
            if (annotation == 'CDNA') {
                _annotation_tag = 'Exon'
            }
            let sorted_annotations = this.annotations;
            sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
            let seqindex = [];
            let sindex = 0;
            let genomeIndex = [];

            // Exons in transcript order.
            let exons = sorted_annotations.filter(a => a.type === _annotation_tag);

            // this.sequence is either the full (intron-containing) sequence or the
            // exon-collapsed cDNA. If it's the cDNA, the exon offsets (a.xi - this.xi)
            // include introns and overshoot after the first exon — so only one exon
            // comes through. Detect that case and index the cDNA by cumulative exon
            // length instead.
            let isCdna = this.isSplicedTranscript();

            let cum = 0;
            for (let a of exons) {
                let len = Math.max(0, Math.floor(a.xf - a.xi));
                let start = isCdna ? cum : Math.max(0, Math.floor(a.xi - this.xi));
                let tt = this.sequence.substring(start, start + len);
                cum += len;
                if (tt && tt.length > 0) {
                    let tr = new Annotation(a.type, a.name, seq.length, seq.length + tt.length);
                    tr.gxi = a.gxi;
                    tr.gxf = a.gxf;
                    seq += tt;
                    // Map each mRNA base back to its source position via the exon's xi.
                    let base = Math.floor(a.xi - this.xi);
                    for (let i = 0; i < tt.length; i++) {
                        seqindex[sindex] = base + i;
                        genomeIndex[sindex] = this.xi + base + i;
                        sindex++;
                    }
                    _annotations.push(tr);
                }
            }

            let getx = (annotation, adjusted_aexons) => {
                let tr = new Annotation(annotation.type, annotation.name, annotation.strand);
                for (let a of adjusted_aexons) {
                    if (a.type.toLowerCase() === 'exon') {

                        if (a.gxi < annotation.xi && a.gxf > annotation.xi) {
                            let xdif = a.gxi - a.xi;
                            tr.xi = annotation.xi - xdif;
                            tr.gxi = annotation.xi;
                        }
                        if (a.gxi < annotation.xf && a.gxf > annotation.xf) {
                            let xdif = a.gxi - a.xi;
                            tr.xf = annotation.xf - xdif;
                            tr.gxi = annotation.xf;
                        }

                    }
                }
                return tr;
            }

            let gxi = this.xi;
            let gxf = this.xf;
            for (let a of sorted_annotations) {

                if (a.type.toLowerCase() === "translation" || a.type.toLowerCase() === "tss" || a.type.toLowerCase() === "stop") {
                    let liftover = getx(a, _annotations);
                    if (liftover) {

                        _annotations.push(liftover)
                    }
                }
            }

            // Name the child for WHAT IT IS, not with an asterisk saying only that it came
            // from something. The suffix follows the annotation this track was built from:
            // CDNA or mRNA (in any case) both mean the spliced transcript and give _mRNA;
            // anything else gives _<that annotation>, so building from Exon or CDS produces
            // "<track>_Exon" / "<track>_CDS" rather than three tracks called the same thing.
            //
            // The suffix was hardcoded to _mRNA, which was right for the Create mRNA menu and
            // wrong for every other annotation this method accepts.
            //
            // Any clash with a track already on the canvas is settled by ensureUniqueTrackName
            // in flexigraph/gene.js when it is added.
            const __ann = ('' + (annotation == null ? '' : annotation)).trim();
            const __suffix = (/^(cdna|mrna)$/i.test(__ann) || !__ann) ? '_mRNA' : ('_' + __ann);
            let track = new Track(this.name + __suffix, 0, seq.length, null, this.strand);
            track.sequence = seq;
            track.chr = this.chr;
            track.annotations = _annotations;
            track.grid.xi = this.grid.xi;
            track.grid.yi = this.grid.yi + Math.abs(this.grid.height) + 1;
            track.track_type = 'CDNA'
            track.grid.width = seq.length;
            track.grid.rescale();
            let trackRef_ = new TrackRef(this, this.xi, this.xf);
            trackRef_.map = seqindex;
            trackRef_.genomeMap = genomeIndex;

            track.trackRef = trackRef_;
            return track;
        }

        setSequence(sequence) {
            this.sequence = sequence;

        }

        async addTrackPlot() {
            let start = -1;
            let end = 0;
            for (let o of this.oligos) {
                if (o.xi < start || start < 0) {
                    start = o.xi;
                    end = o.xf;
                }
                if (o.xf > end) {
                    end = o.xf;
                }
                o.percent_control = Math.random() * 100;
            }
            let tr = new TrackPlot('plot', start, this.y, (end - start), 1, start, end, this.oligos)
            this.plots.push(tr);
        }

        getHighlightedSequence() {
            if (this.markstart != null && this.markstart >= 0) {
                let startindex = Math.floor(this.markstart - this.xi);
                let endindex = Math.floor(this.markend - this.xi);

                if (this.sequence) {
                    return this.sequence.substring(startindex, endindex);
                }
            }
            return null;
        }

        toggleAnnotations() {
            this.showAnnotaions = !this.showAnnotaions;
        }

        getSequenceRange(start, end) {
            let seq_index_start = Math.floor(start) - this.xi;
            let seq_index_end = Math.floor(end) - this.xi;
            let s = ''
            for (let i = seq_index_start; i < seq_index_end; i++) {
                if (this.sequence[i]) {
                    s += this.sequence[i]
                }
            }
            return s;
        }

        getAttributionScore(x, attribution_type) {
            let sum = 0.0;
            for (let a of this.track_layers) {
                if (a.attribution_type && a.attribution_type === attribution_type) {
                    let v = a.getScore(x);
                    sum += v.y;
                }
            }
            return (-1 * sum);
        }

        getSequenceRange__(start, end) {
            let seq_index_start = Math.floor(start) - this.grid.xmin;
            let seq_index_end = Math.floor(end) - this.grid.xmin;
            let s = ''
            for (let i = seq_index_start; i < seq_index_end; i++) {
                s += this.sequence[i]
            }
            return s;
        }

        getSequence() {
            return this.sequence;
        }

        doRectanglesOverlap(rect1, rect2) {

            var rect1_x1 = rect1.xi - 1;
            var rect1_y1 = rect1.y;
            var rect2_x1 = rect2.xi;
            var rect2_y1 = rect2.y;

            var rect1_x2 = rect1.xf + 2;
            var rect1_y2 = rect1.y + rect1.getHeight();
            var rect2_x2 = rect2.xf;
            var rect2_y2 = rect2.y + rect2.getHeight();

            if (rect1_x1 < rect2_x2 && rect1_x2 > rect2_x1 && rect1_y1 < rect2_y2 && rect1_y2 > rect2_y1) {

                return true;
            } else {

                return false;
            }
        }

        setColor(color) {
            this.color = color;
        }

        addOligo(oligo) {
            if (oligo === undefined) {
                console.log(' oligo was null so rejecting.... ')
                return;
            }

            if (oligo.synthesisSequence != null && oligo.structure != null && oligo.synthesisSequence.length > 0 && oligo.structure.length > 0) {
                setTimeout(async () => {
                    const dbhost = window["env"]["db"];
                    if (dbhost) {

                        let r = await POSTJSON([oligo], `${dbhost}/verify`);

                        const key = `${oligo.synthesisSequence}-${oligo.structure}`;
                        if (r[key] && r[key].id) {
                            oligo.id = r[key].id
                        }
                    }
                }, 1000)
            }

            for (let o of this.oligos) {
                if (o.synthesisSequence === oligo.synthesisSequence && o.structure === oligo.structure && o.name === oligo.name && o.id === oligo.id) {
                    console.log(" Oligo was rejected on this track because it is a duplicate ")
                    return;
                }
            }
            if (oligo.synthesisSequence && (oligo.synthesisSequence == null || oligo.synthesisSequence.length <= 0)) {
                if (this.strand < 0) {
                    oligo.synthesisSequence = Biopolymer.comp(oligo.sequence)
                } else {
                    oligo.synthesisSequence = Biopolymer.reverseComp(oligo.sequence)
                }
            }
            if (oligo.setStrand) {
                oligo.setStrand(this.strand)
            }

            // Stack upward until the new oligo clears EVERY existing one. This used to be a
            // single pass per oligo: once it had cleared o1 it never rechecked o1, so moving up
            // to clear a later o3 could push it straight back onto o1 and the two drew on top of
            // each other. Now compounds start life on the same low lane just above the sequence,
            // so that collision is the normal case rather than a rarity, and it has to settle.
            {
                if (oligo.y <= 0.01) oligo.y = 0.1;
                let guard = 0;
                let moved = true;
                while (moved && guard < 2000) {
                    moved = false;
                    for (const o of this.oligos) {
                        while (this.doRectanglesOverlap(o, oligo) && guard < 2000) {
                            oligo.setY(oligo.y += 0.01);
                            guard++;
                            moved = true;
                        }
                    }
                }
            }
            this.oligos.push(oligo)
            if (oligo.y >= this.grid.ymax) {
                this.grid.ymax = oligo.y + 0.11;
                this.grid.rescale();
            }
        }
        addsnpindel(snpindel) {

            this.snpindels.push(snpindel);
        }

        removesnp(snpindel) {
            const index = this.snpindels.indexOf(snpindel);
            if (index > -1) {
                this.snpindels.splice(index, 1);
            }
        }

        gff(g) {
            this.addGFF(g);
        }

        getAnnotationByName(name) {
            for (let annotation of this.annotations) {
                console.log('name ' + annotation.name);

                if (annotation.name.toLowerCase() === name.toLowerCase()) {
                    return annotation;
                }
            }
        }

        findNearestAnnotation(targetX, annotationType) {
            if (!annotationType || annotationType == null) {
                if (this.annotations.length === 0) return null;
                let nearestObject = this.annotations[0];
                let smallestDifference = Math.abs(this.annotations[0].xi - targetX);
                this.annotations.forEach(obj => {
                    const difference = Math.abs(obj.xi - targetX);
                    if (difference < smallestDifference) {
                        smallestDifference = difference;
                        nearestObject = obj;
                    }
                });
                return nearestObject;
            } else {
                const filteredArr = annotationType ? this.annotations.filter(obj => obj.type === annotationType) : this.annotations;
                if (filteredArr.length === 0) return null;
                let nearestObject = filteredArr[0];
                let smallestDifference = Math.abs(filteredArr[0].xi - targetX);
                filteredArr.forEach(obj => {
                    const difference = Math.abs(obj.xi - targetX);
                    if (difference < smallestDifference) {
                        smallestDifference = difference;
                        nearestObject = obj;
                    }
                });
                return nearestObject;
            }
        }

        getAnnotation(x, y) {
            if (y < 0) {
                y = y * (-1)
            }
            let selected = [];
            let yv = Math.floor(y);
            let xv = Math.floor(x);
            console.log(' yv ' + yv + ' y ' + this.y);
            if (yv === this.y) {
                for (let annotation of this.annotations) {
                    if (annotation.inAnnotation(xv)) {

                        selected.push(annotation);

                    }
                }
            }
            return selected;
        }

        quickHighlightOligos() {
            console.log('debubg');
            for (let o of this.oligos) {
                o.highlight__ = true;
            }

            setTimeout(() => {
                for (let o of this.oligos) {
                    o.highlight__ = false;
                }

            }, 15000)

        }

        getLastTouched() {
            return new Date().now
        }

        getAnnotationX(x) {
            let selected = [];
            let xv = Math.floor(x);
            for (let annotation of this.annotations) {
                if (annotation.inAnnotation(xv)) {

                    selected.push(annotation);

                }
            }
            return selected;
        }

        removeDuplicateAnnotations() {
            let an = {};
            for (let o of this.annotations) {
                an[o.name] = o;
            }
            let nkey = Object.keys(an);
            this.annotations = [];
            for (let i of nkey) {
                this.annotations.push(an[i])
            }
            let selected = {};
            for (let sid of this.snpindels) {
                selected[sid.name] = sid;
            }
            this.snpindels = []
            let keys = Object.keys(selected);
            for (let k of keys) {
                this.snpindels.push(selected[k])
            }
        }

        removeDuplicateSnps() {
            let selected = {};
            for (let sid of this.snpindels) {
                selected[sid.name] = sid;
            }
            this.snpindels = []
            let keys = Object.keys(selected);
            for (let k of keys) {
                this.snpindels.push(selected[k])
            }
        }

        getAnnotationsInRange(xstart, xend) {
            let selected = [];
            for (let o of this.annotations) {
                if (xstart <= o.xi && xend >= o.xf) {
                    selected.push(o);
                }
                else
                    if (o.inAnnotation(xstart) || o.inAnnotation(xend)) {
                        selected.push(o);

                    }
            }
            return selected;
        }

        getOligosInRange(xstart, xend) {
            let selected = [];
            for (let o of this.oligos) {
                if (xstart <= o.xi && xend >= o.xf) {
                    selected.push(o);
                }
                else
                    if (o.inAnnotation(xstart) || o.inAnnotation(xend)) {
                        selected.push(o);
                    }
            }
            return selected;
        }

        getSnpindelsInRange(xstart, xend, graph) {
            let selected = [];
            for (let sid of this.snpindels) {
                if (xstart <= sid.xi && xend >= sid.xf) {
                    selected.push(sid);
                }
                else
                    if (sid.inAnnotation(xstart, xend, this.grid, graph)) {
                        selected.push(sid);
                    }
            }
            return selected;
        }

        getOligo(x, y, graph) {
            let selected = [];

            for (let o of this.oligos) {
                if (o != null && o.over != null && graph != null)
                    if (o.over(x, y, graph, this.grid)) {
                        selected.push(o);
                    }
            }
            return selected;
        }

        getSelectedOligos() {
            let selected = [];
            for (let o of this.oligos) {
                if (o.selected)
                    selected.push(o);
            }
            return selected;
        }

        highlightFeature(feature_type, feature) {
            let hl = highlighters[feature_type + '.' + feature]
            this.highlight_features[feature_type + '.' + feature] = hl;
        }

        clearHighlights() {
            this.markend - 1
            this.highlight_features = {}
            for (let s of this.snpindels) {
                s.highlight = false;
            }
            for (let o of this.oligos) {
                o.highlight__ = false;
            }
        }

        getSnpindel(x, y) {
            if (y < 0) {
                y = y * (-1)
            }
            let selected = [];
            let yv = Math.floor(y);
            let xv = this.xi + x;
            for (let sid of this.snpindels) {
                if (sid.inAnnotation(xv)) {

                    selected.push(sid);
                }
            }
            return selected;
        }

        async fetchSnpindel(x, y, range) {

            let phaseSelect = null;
            if (y !== null && y < 0) {
                phaseSelect = 0;
            } else if (y !== null && y >= 0) {
                phaseSelect = 1;
            }

            let closest = null;
            let closestdist = null;
            for (let sid of this.snpindels) {

                if (sid.phase == phaseSelect || phaseSelect === null) {
                    let dist = Math.min(Math.abs(sid.xi - x), Math.abs(sid.xf - x));
                    if (dist < range) {
                        if (closest && closestdist && dist < closestdist) {
                            closest = sid;
                            closestdist = dist;
                        } else if (closest === null) {
                            closest = sid;
                            closestdist = dist;
                        }
                    }

                }
            }
            return closest;
        }

        async neighborSnpindel(snpindel, range, phase) {

            let neighbors = [];
            for (let sid of this.snpindels) {
                if (sid.id != snpindel.id && sid.phase == snpindel.phase && phase == 1) {

                    let dist = Math.min(Math.abs(sid.xi - snpindel.xf), Math.abs(sid.xf - snpindel.xi), Math.abs(sid.xi - snpindel.xi));
                    if (dist < range) {
                        neighbors.push(sid);
                    }
                } else if (sid.id != snpindel.id && sid.phase != snpindel.phase && phase == 0) {
                    let dist = Math.min(Math.abs(sid.xi - snpindel.xf), Math.abs(sid.xf - snpindel.xi), Math.abs(sid.xi - snpindel.xi));
                    if (dist < range) {
                        neighbors.push(sid)
                    }
                }
            }
            return neighbors;
        }

        async phasesnpindels(phase) {
            let variants_phase = [];
            let variants_alt = [];
            let opp = null;

            for (let sid of this.snpindels) {

                if (sid.phase == phase) {

                    opp = await this.neighborSnpindel(sid, 30, 0);
                    if (opp.length == 0) {
                        variants_phase.push(sid);
                    } else {
                        let hasopp = 0;
                        for (let o of opp) {
                            if (o.xi == sid.xi && o.alternate0 == sid.alternate0) {
                                hasopp = 1;
                                break;
                            }
                        }
                        if (!hasopp) {
                            variants_phase.push(sid);
                        }
                    }

                } else if (sid.phase != phase) {
                    opp = await this.neighborSnpindel(sid, 30, 0);

                    if (opp.length == 0) {
                        variants_alt.push(sid)
                    } else {
                        let hasopp = 0;
                        for (let o of opp) {
                            if (o.xi == sid.xi && o.alternate0 == sid.alternate0) {
                                hasopp = 1;
                                break;
                            }
                        }
                        if (!hasopp) {
                            variants_alt.push(sid);
                        }
                    }

                }
            }
            return [variants_phase, variants_alt];
        }

        liftSnpindels() {

            let mapConverter = {};
            if (this.trackRef.genomeMap && this.trackRef.genomeMap.length > 0) {
                this.trackRef.genomeMap.forEach((element, index) => {

                    mapConverter[element] = index;
                });

                if (this.trackRef.track.snpindels && this.trackRef.track.snpindels.length > 0) {
                    for (let sid of this.trackRef.track.snpindels) {

                        if (this.trackRef.genomeMap.includes(sid.xi)) {
                            let _sid = new SnpIndel(sid.type, mapConverter[sid.xi], sid.reference, sid.alternate, sid.phase, sid.transcriptStrand, sid.id + '*');

                            _sid.name = sid.name;

                            this.snpindels.push(_sid);

                        } else if (this.trackRef.genomeMap.includes(sid.xf)) {
                            let _sid = new SnpIndel(sid.type, mapConverter[sid.xf - sid.reference.length], sid.reference, sid.alternate, sid.phase, sid.transcriptStrand, sid.id + '*');
                            _sid.name = sid.name;

                            this.snpindels.push(_sid);
                        }
                    }
                }
            }

        }

        liftLayers() {

            let mapConverter = {};
            if (this.trackRef.genomeMap && this.trackRef.genomeMap.length > 0) {
                this.trackRef.genomeMap.forEach((element, index) => {

                    mapConverter[element] = index;
                });
                if (this.trackRef.track.track_layers && this.trackRef.track.track_layers.length > 0) {
                    for (let tl of this.trackRef.track.track_layers) {
                        let ttl = Object.assign(new TrackLayer(), tl)
                        let interval = []
                        for (let sid of tl.intervals) {
                            if (this.trackRef.genomeMap.includes(sid.x1) && this.trackRef.genomeMap.includes(sid.x2)) {
                                interval.push({ x1: mapConverter[sid.x1], x2: mapConverter[sid.x2], t: sid.t })
                            }
                        }
                        ttl.intervals = interval;
                        this.addLayer(ttl)
                    }
                }
            }

        }

        liftPlots() {
            let mapConverter = {};
            if (this.trackRef.genomeMap && this.trackRef.genomeMap.length > 0) {
                this.trackRef.genomeMap.forEach((element, index) => {
                    mapConverter[element] = index;
                });

                console.log('debubg');
                if (this.trackRef.track.plots && this.trackRef.track.plots.length > 0) {
                    for (let sid of this.trackRef.track.plots) {
                        if (this.trackRef.genomeMap.includes(sid.x)) {

                            if (sid.mg != null) {
                                let tp = Object.assign(new TrackPlot(), sid)
                                let amg = Object.assign(new MGrid(), sid.mg);
                                tp.mg = amg;
                                tp.x = mapConverter[tp.x]

                                this.plots.push(tp)
                            } else {
                                let tp = Object.assign(new Barchart(), sid)
                                tp.x = mapConverter[tp.x]

                                this.plots.push(tp)
                            }

                        }
                    }
                }
            }
        }

        liftCompounds() {
            let mapConverter = {};
            if (this.trackRef.genomeMap && this.trackRef.genomeMap.length > 0) {
                this.trackRef.genomeMap.forEach((element, index) => {
                    mapConverter[element] = index;
                });

                if (this.trackRef.track.oligos && this.trackRef.track.oligos.length > 0) {
                    for (let sid of this.trackRef.track.oligos) {
                        if (this.trackRef.genomeMap.includes(sid.xi) && this.trackRef.genomeMap.includes(sid.xf)) {
                            let ostring = JSON.parse(JSON.stringify(sid));

                            let ob = Object.assign(new Oligo(), ostring)
                            ob.xi = mapConverter[ob.xi]
                            ob.xf = mapConverter[ob.xf]

                            this.addOligo(ob)
                        }
                    }
                }
            }
        }

        addGFF(gff) {
            let lines = gff.split('\n')
            for (let line of lines) {
                let tabs = line.split(/\s+/g);
                let chrom = tabs[0]
                let source = tabs[1]
                let name = tabs[2]
                let start = +tabs[3]
                let end = +tabs[4]
                let score = tabs[5]
                let strand = tabs[6]
                let phase = tabs[7]
                let attributes = tabs[8]
                if (start === undefined)
                    console.log('debubg');

                let tr = new Annotation(name, name, start, end, strand, attributes);
                this.annotations.push(tr)
            }
        }

        add(annotation) {
            this.annotations.push(annotation)
        }
        setAnnotation(annotation) {
            for (let a of this.annotations) {
                if (a.name.toLowerCase() === annotation.name.toLowerCase()) {
                    return;
                }
            }
            this.annotations.push(annotation)
        }

        gitVisibleTrackRange(__graph) {
            let graph = __graph.graph;
            let gwcxs = graph.Xwc(0);
            if (!gwcxs)
                return -1;

            let gwcxf = graph.Xwc(0 + graph.width);
            if (!gwcxf)
                return -1;
            let twcxs = this.grid.Xwc(gwcxs - 2 * this.grid.xi);
            let twcxf = this.grid.Xwc(gwcxf - 2 * this.grid.xi);
            let startIndex = Math.floor(twcxs);
            let endIndex = Math.floor(twcxf);
            return {
                start: startIndex,
                end: endIndex
            }
        }

        getVisibleOligos(start, end) {
            let o = [];
            for (let oligo of this.oligos) {

                if (oligo.y >= this.grid.ymax) {
                    this.grid.ymax = oligo.y + 0.111;
                }

                if ((oligo.xi >= start && oligo.xf < end) ||
                    (oligo.xf <= end && oligo.xf > start) ||
                    (oligo.xi < end && oligo.xi >= start) ||
                    (oligo.xi < start && oligo.xf > end)) {
                    o.push(oligo)
                }
            }
            return o;
        }

        getVisibleSNPs(start, end) {
            let o = [];
            for (let snp of this.snpindels) {
                if ((snp.xi >= start && snp.xi < end) ||
                    (snp.xf >= start && snp.xf < end)) {
                    o.push(snp)
                }
            }

            return o;
        }

        removeTracksLayersWhereNameStartsWith(name) {
            this.track_layers = this.track_layers.filter(tt => {
                if (tt.name) {
                    console.log(" ttn ame " + tt.name);
                    return !tt.name.toLowerCase().trim().startsWith(name.trim().toLowerCase());
                }
                return true;
            });
        }
        removeTrack(tl) {
            this.track_layers = this.track_layers.filter(tt => {
                if (tt === tl) {
                    return false;
                }
                return true;
            });
        }

        removeTrackLayers() {
            this.track_layers = []
        }

        getTrackOligosXY(xi, xf, yi, yf) {
            let o = [];
            for (let oligo of this.oligos) {
                if ((this.grid.X(oligo.xi) >= xi && this.grid.X(oligo.xf) < xf) ||
                    (this.grid.X(oligo.xf) <= xf && this.grid.X(oligo.xf) > xi) ||
                    (this.grid.X(oligo.xi) < xf && this.grid.X(oligo.xi) >= xi) ||
                    (this.grid.X(oligo.xi) < xi && this.grid.X(oligo.xf) > xf)) {
                    o.push(oligo)
                }
            }

            let o2 = []
            for (let oligo of o) {
                let gy = this.grid.Y(oligo.y);
                if (gy > yi && gy < yf) {
                    o2.push(oligo)
                }
            }
            return o2;
        }

        mutateTrackWithSingleMutation(mutation) {
            if (this.strand < 0) {
                if (mutation.sequence != null && mutation.sequence != undefined) {
                    if (mutation.xi <= mutation.xf) {

                        this.sequence = this.sequence.substring(0, mutation.xi - this.xi) + mutation.sequence +
                            this.sequence.substring(mutation.xf - this.xi);

                    } else {
                        this.sequence = this.sequence.substring(0, mutation.xi) + mutation.sequence +
                            this.sequence.substring(mutation.xi - this.xi);
                    }
                    if (Math.abs(mutation.reference.length - mutation.sequence.length) != 0) {
                        this.markend = this.markstart + mutation.sequence.length;
                        this.adjustDownstreamAnnotations(mutation.xi, mutation.xf, mutation.sequence.length - mutation.reference.length)
                    }
                } else if (mutation.alternate) {
                    if (mutation.xi <= mutation.xf) {
                        this.sequence = this.sequence.substring(0, mutation.xi - this.xi) + mutation.alternate + this.sequence.substring(mutation.xf - this.xi);
                    } else {
                        this.sequence = this.sequence.substring(0, mutation.xi) + mutation.alternate + this.sequence.substring(mutation.xi - this.xi);
                        if (Math.abs(mutation.reference.length - mutation.sequence.length) != 0) {
                            this.adjustDownstreamAnnotations(mutation.xi, mutation.xf, mutation.sequence.length - mutation.reference.length)
                        }
                    }
                }

            } else {
                if (mutation.alternate != null && mutation.alternate != undefined) {
                    if (mutation.xi <= mutation.xf) {
                        this.sequence = this.sequence.substring(0, mutation.xi - this.xi) + mutation.alternate + this.sequence.substring(mutation.xf - this.xi);
                    } else {
                        this.sequence = this.sequence.substring(0, mutation.xi) + mutation.alternate + this.sequence.substring(mutation.xi - this.xi);
                    }
                    if (Math.abs(mutation.reference.length - mutation.alternate.length) != 0) {
                        this.adjustDownstreamAnnotations(mutation.xi, mutation.xf, mutation.alternate.length - mutation.reference.length)
                    }
                }
            }
        }

        mutateTrack(phase) {

            let mutations = this.snpindels.filter(snp => snp.phase === phase);
            mutations.sort((a, b) => b.xi - a.xi);
            mutations.forEach(mutation => {

                if (this.strand < 0 && mutation.transcriptStrand < 0) {
                    if (mutation.sequence != null && mutation.sequence != undefined) {
                        if (mutation.xi <= mutation.xf) {
                            this.sequence = this.sequence.substring(0, mutation.xi - this.xi) + mutation.sequence + this.sequence.substring(mutation.xf - this.xi);
                        } else {
                            this.sequence = this.sequence.substring(0, mutation.xi) + mutation.sequence + this.sequence.substring(mutation.xi - this.xi);
                        }
                        if (Math.abs(mutation.reference.length - mutation.sequence.length) != 0) {
                            this.adjustDownstreamAnnotations(mutation.xi, mutation.xf, mutation.sequence.length - mutation.reference.length)
                        }
                    } else if (mutation.alternate) {
                        if (mutation.xi <= mutation.xf) {
                            this.sequence = this.sequence.substring(0, mutation.xi - this.xi) + mutation.alternate + this.sequence.substring(mutation.xf - this.xi);
                        } else {
                            this.sequence = this.sequence.substring(0, mutation.xi) + mutation.alternate + this.sequence.substring(mutation.xi - this.xi);
                            if (Math.abs(mutation.reference.length - mutation.sequence.length) != 0) {
                                this.adjustDownstreamAnnotations(mutation.xi, mutation.xf, mutation.sequence.length - mutation.reference.length)
                            }
                        }
                    }

                } else {
                    if (mutation.alternate != null && mutation.alternate != undefined) {
                        if (mutation.xi <= mutation.xf) {
                            this.sequence = this.sequence.substring(0, mutation.xi - this.xi) + mutation.alternate + this.sequence.substring(mutation.xf - this.xi);
                        } else {
                            this.sequence = this.sequence.substring(0, mutation.xi) + mutation.alternate + this.sequence.substring(mutation.xi - this.xi);
                        }
                        if (Math.abs(mutation.reference.length - mutation.alternate.length) != 0) {
                            this.adjustDownstreamAnnotations(mutation.xi, mutation.xf, mutation.alternate.length - mutation.reference.length)
                        }
                    }
                }
            });
        }
        adjustDownstreamAnnotations(start, index, length) {
            let remove_annotations = []
            for (let annotation of this.annotations) {
                if (this.strand >= 0) {

                    if (annotation.xi >= start && annotation.xf < index && Math.abs(annotation.xf - annotation.xi) < Math.abs(length)) {
                        remove_annotations.push(annotation)
                    } else {
                        if (annotation.xi > index) {
                            annotation.xi += length;
                            annotation.xf += length;
                        } else if (annotation.xf > index) {
                            annotation.xf += length;
                        }
                    }
                } else {

                    if (annotation.xi >= start && annotation.xf < index && Math.abs(annotation.xf - annotation.xi) < Math.abs(length)) {
                        remove_annotations.push(annotation)
                    } else {

                        if (annotation.xf >= index) {
                            annotation.xf += length;
                        }
                        if (annotation.xi >= index) {
                            annotation.xi += length;
                        }
                    }

                }

            }

            for (let annotation of this.annotations) {
                if (annotation.xi < this.xi) {
                    this.xi = annotation.xi;
                    this.grid.xmin = this.xi - 1;
                }
                if (annotation.xf > this.xf) {
                    this.xf = annotation.xf;
                    this.grid.xmax = this.xf + 1;
                }
            }

            for (let r of remove_annotations) {
                this.removeAnnotation(r);
            }

            this.grid.width = this.sequence.length + 1;
            this.grid.xmax = this.grid.xmax + 1;
            this.grid.rescale();
        }

        getVisibleOligosXY(start, end, ymin, ymax) {
            let o = [];
            start = +start;
            end = +end;
            for (let oligo of this.oligos) {
                if ((oligo.xi >= start && oligo.xf < end) ||
                    (oligo.xf <= end && oligo.xf > start) ||
                    (oligo.xi < end && oligo.xi >= start) ||
                    (oligo.xi < start && oligo.xf > end)) {
                    o.push(oligo)
                }
            }

            let o2 = []
            for (let oligo of o) {
                let gy = oligo.y;

                if (gy >= ymin && gy < ymax) {
                    o2.push(oligo)
                }
            }
            return o2;
        }

        select() {
            this.showResizeBar = true;
        }
        selectTrackAndSeq() {
            this.select();
            this.markstart = this.grid.xmin;
            this.markend = this.grid.xmax;

        }
        deselect() {
            this.showResizeBar = false;
            this.markend = null;
            this.markstart = null;
        }

        removeAnnotationsByCount(count) {
            const nameCounts = {};
            this.annotations.forEach(annotation => {
                if (nameCounts[annotation.name]) {
                    nameCounts[annotation.name]++;
                } else {
                    nameCounts[annotation.name] = 1;
                }
            });

            this.annotations = this.annotations.filter(annotation => nameCounts[annotation.name] != count);
        }

        removeAnnotation(annotation) {
            const index = this.annotations.indexOf(annotation);
            if (index > -1) {
                this.annotations.splice(index, 1);
            }
        }
        removeStructure(structure) {
            const index = this.structures.indexOf(structure);
            if (index > -1) {
                this.structures.splice(index, 1);
            }
        }
        removeAnnotationByType(type) {
            let nannotations = []
            for (let a of this.annotations) {
                if (a.type.toLowerCase() === type.toLowerCase()) {

                } else {
                    nannotations.push(a);
                }
            }
            this.annotations = nannotations;
        }

        setORFColor(mode) {
            codon_colors.mode = mode;
        }

        removeOligos(oligosToRemove, comparator) {
            console.log('debubg');
            if (!comparator) {
                comparator = (a, b) => a.id === b.id;
            }
            this.oligos = this.oligos.filter(oligo => {
                return !oligosToRemove.some(oligoToRemove => comparator(oligo, oligoToRemove));
            });
        }

        removeOligo(oligo) {
            const index = this.oligos.indexOf(oligo);
            if (index >= 0)
                this.oligos.splice(index, 1)
        }
        removeOligosOfType(typeToRemove) {
            this.oligos = this.oligos.filter(obj => obj.type !== typeToRemove);
        }
        countOligosOfType(typeValue) {
            return this.oligos.reduce((count, obj) => {
                if (obj.type === typeValue) {
                    return count + 1;
                }
                return count;
            }, 0);
        }
        getExonCountVisible() {
            for (let a of this.annotations) {
                if (a.showIndex) {
                    return true;
                }
            }
            return false;
        }

        showExonIndicies() {
            for (let a of this.annotations) {
                if (a.showIndex != null) {
                    a.showIndex = true;
                }
            }
        }
        hideExonIndicies() {
            for (let a of this.annotations) {
                if (a.showIndex != null) {
                    a.showIndex = false;
                }
            }
        }

        getKB() {
            if (this.sequence) {
                const lengthInBP = this.sequence.length;
                const lengthInKB = Math.floor(lengthInBP / 1000);
                return lengthInKB;
            } else {
                return 0;
            }
        }

        highlight(xi, xf) {
            if (this.markstart < 0) {
                this.markstart = 0;
            }
            this.markstart = xi;
            if (xf > this.xf) {
                this.markend - 1;

            } else {
                this.markend = xf;
            }
        }

        ffont = "11px Verdana";
        marktime = null;
        detail_ffont = "16px Verdana";
        detail_ffont_large = "26px Verdana";
        detail_ffont4 = "18px Verdana";
        detail_ffont2 = "15px Verdana";
        detail_ffont3 = "13px Verdana";
        detail_ffont6 = "11px Verdana";
        detail_ffont7 = "9px Verdana";

        getSelectedPoints() {
            return [];
        }

        deselectIt() {

        }
        selectIt() {

            console.log(" select it ")

        }

        inButtons(x, y, pt) {
            console.log(" in buttons ?")
            this.highlightbutton = null;

            let b = this.getButtonAt(x, y, pt)
            if (b && b.button) {
                this.highlightbutton = b.button.name;

                return true;
            }
            else {
                return false;
            }
        }

        clk_drag(pt) {
            if (!pt) {
                return;
            }

            this.selectIt()
            if (pt.wbid != null && pt.wbid === 'click_and_drag' + this.name) {
                return;
            }

            let keydown = (event) => {
                if (event.ctrlKey && event.key !== 'Control') {
                    return;
                }
                if (event.key == 'Control') {
                    return;
                }
                if (event.key === 'Backspace') {
                }
                else if (event.key === 'Enter') {
                }
                if (event.key === 'Tab') {
                }
                else if (event.key === 'Delete') {
                }
                if (/^[a-zA-Z0-9!.\-%$*&#@()[\]{}_ :,=\/+*^]$/.test(event.key)) {
                }

            }

            let px = 0;
            let py = 0;
            let md = false;

            let mouseDownListener = async (x, y) => {
                if (this.inButtons(x, y, pt)) {
                    return
                }
                md = true;
                px = this.grid.Xwc(pt.grid.Xwc(x) - this.grid.xi * 2);
                py = this.grid.Ywc(pt.grid.Ywc(y));
                this.markstart = px;
            };

            let mouseMoveListener = async (x, y) => {
                this.selectIt();
                if (this.inButtons(x, y, pt)) {
                    return;
                }
                if (md) {
                    let nx = this.grid.Xwc(pt.grid.Xwc(x) - this.grid.xi * 2);
                    let xd = nx - px;
                    let yd = py - this.grid.Ywc(pt.grid.Ywc(y));
                    pt.grid.rescale();
                    this.markend = nx;
                }

            }
            let mouseUpListener = async (x, y) => {
                px = 0;
                py = 0;
                md = false;
                let mmx = pt.grid.Xwc(x);
                let mmy = pt.grid.Ywc(y);
                let scx = x;
                let scy = y;
                this.grid.rescale();
                let sel = []

                let bb = this.getButtonAt(x, y, pt)
                if (bb) {
                    bb.button.action(pt)
                }

            }

            let t = {
                id: 'click_and_drag' + this.name,
                mouseMoveListener: mouseMoveListener,
                mouseUpListener: mouseUpListener,
                mouseDownListener: mouseDownListener,
                keydown: keydown,
                init: () => {
                },
                close: () => {
                },
                priority: true,
                draw: (grid, ctx) => {
                },
                menuManager: null,
                smenu: null
            }
            if (pt && pt.wb)
                pt.wb(t)
        }

        getWidth() {
            return this.grid.width;
        }
        getHeight() {
            return this.grid.height;
        }

        margin = { top: -25, right: 0, bottom: 0, left: 0 };

        inside(grid, x, y, convert) {
            grid.rescale();
            let screen_width = grid.screenWidth(this.getWidth());
            let screen_height = grid.screenHeight(this.getHeight())
            let scx = grid.X(x)
            let scy = grid.Y(y) + screen_height
            let _scy = grid.Y(this.grid.yi);
            let _sc = grid.X(this.grid.xi);
            if (scx > _sc - this.margin.left && scx < _sc + screen_width + this.margin.right) {
                if (scy > _scy + this.margin.top &&
                    scy < _scy + screen_height + this.margin.bottom) {
                    return true;
                }
            }
            return false;
        }

        async drawPlot(plateTrack, ctx) {
            const graph = plateTrack.grid;

            let deg = 0;
            if (this.strand === (-1) || this.strand === '-1') {
                deg = 3.14159;
            }
            let y = 0;

            this.grid.ymax = -100;
            this.grid.ymin = 100

            if (this.grid.xi == NaN) {
                this.grid.xi = 0;
                this.grid.yi = 0;

                this.grid.xmin = this.xi;
                this.grid.xmax = this.xf;
                this.grid.setInset(0, 0)
                this.grid.yi = this.y + 1;
                this.grid.setymin(-100);
                this.grid.setymax(100);
            }
            graph.rescale();
            this.grid.rescale();
            if (this.showLayers) {
                for (let l of this.track_layers) {
                    l.setXi(graph.X(this.grid.xi))
                    l.setYi(graph.Y(this.grid.yi))
                    l.setHeight(graph.screenHeight(this.grid.height));
                    l.setWidth(graph.screenWidth(this.grid.width))
                }

                let highlighted = null;
                for (let l of this.track_layers) {
                    let xi = l.getXi();
                    let w = l.getWidth();
                    let yi = l.getYi();
                    let h = l.getHeight();
                    if (xi > 0 && xi < graph.width || xi + w > 0 && xi + w < graph.width ||
                        xi < 0 && xi + w > graph.width || xi > 0 && xi + w < graph.width ||
                        yi > 0 && yi < graph.height || yi + h > 0 && yi + h < graph.height ||
                        yi < 0 && yi + h > graph.height || yi > 0 && yi + h < graph.height) {

                        if (!l.highlight)
                            await l.drawPlot(plateTrack, this, ctx)
                        else {
                            highlighted = l;
                        }
                    }
                }
                if (highlighted != null) {
                    await highlighted.drawPlot(plateTrack, this, ctx)
                }

            }
            let screencell = Math.abs(graph.screenWidth(this.grid.screenWidth(1)))
            let ystart = graph.Y(this.grid.yi)
            let yend = graph.screenHeight(this.grid.height)
            let trackScreenWidth = graph.screenWidth(this.grid.width)
            let gwcxs = graph.Xwc(0);
            let gwcxf = graph.Xwc(0 + graph.width);

            let twcxs = this.grid.Xwc(gwcxs);
            let twcxf = this.grid.Xwc(gwcxf);

            let visOligos = this.getVisibleOligos(twcxs, twcxf)
            let snpsv = []
            if (this.showSnpIndels)
                snpsv = this.getVisibleSNPs(twcxs, twcxf);
            if (this.highlightstart != null && this.highlightstart >= 0 && this.highlightend != null && this.highlightend > this.highlightstart) {
                const xCenter = (graph.X(this.highlightstart)) + graph.X((this.highlightend)) / 2;
                const yCenter = graph.Y(this.grid.yi + this.grid.height);
                const radius = (graph.X((this.highlightend)) - graph.X((this.highlightstart))) / 2;
                ctx.beginPath();
                ctx.strokeStyle = "cyan";
                ctx.lineWidth = 15;
                ctx.arc(xCenter, yCenter, radius, 0, Math.PI, true);
                ctx.stroke();
            }
            if (screencell > 5) {
                if (!gwcxs)
                    return;
                if (!gwcxf)
                    return;
                let twcxs = this.grid.Xwc(gwcxs - 2 * this.grid.xi);
                let twcxf = this.grid.Xwc(gwcxf - 2 * this.grid.xi);
                for (let index = Math.floor(twcxs); index < Math.floor(twcxf); index++) {
                    let color = 'lightGray'
                    if (this.sequence && index < this.sequence.length) {
                        let ch1 = this.sequence[index];

                        if (this.trackRef) {
                            let ch2 = this.trackRef.track.sequence[index]
                            if (ch1 == '-' || ch2 === '-') {
                                color = 'lightYellow';
                            }
                            else
                                if (ch1 != ch2) {
                                    color = 'red';
                                }

                            drawLine(ctx, graph.X(this.grid.X(index)), graph.Y(this.grid.Y(0)), graph.X(this.trackRef.track.grid.X(index)), graph.Y(this.trackRef.track.grid.Y(0)), color);
                        }
                    }
                }
            } else if (screencell > 0.005) {
                if (this.trackRef && this.trackRef.map && this.showTrackRefMap) {
                    let j = this.trackRef.map;
                    for (let index = Math.floor(twcxs); index < Math.floor(twcxf); index++) {
                        let jindex = j[index];
                        graph.drawDashedLine((index), this.grid.Y(0), this.trackRef.track.grid.X(jindex + this.trackRef.track.grid.getxmin()), this.trackRef.track.grid.Y(0), 'lightYellow');
                    }
                }
                for (let index = Math.floor(twcxs); index < Math.floor(twcxf); index++) {
                    let color = 'lightGray'
                    if (this.sequence != null && index < this.sequence.length) {
                        let ch1 = this.sequence[index]

                        if (this.trackRef && this.trackRef.map && this.trackRef.map.length >= 0) {

                            let j = this.trackRef.map;
                            let jindex = j[index];
                            let ch2 = this.trackRef.track.sequence[index]
                            if (ch1 == '-' || ch2 === '-') {
                                color = 'maroon';
                                drawLine(ctx, graph.X(this.grid.X(index)), graph.Y(this.grid.Y(0)), graph.X(this.trackRef.track.grid.X(jindex)), graph.Y(this.trackRef.track.grid.Y(0)), color);
                            }
                            else
                                if (ch1 != ch2) {

                                }
                        } else if (this.trackRef && this.trackRef.showMismatches) {
                            let ch2 = this.trackRef.track.sequence[index]
                            if (ch1 == '-' || ch2 === '-') {
                                color = 'darkGray';
                                drawLine(ctx, graph.X(this.grid.X(index)), graph.Y(this.grid.Y(0)), graph.X(this.trackRef.track.grid.X(index + this.trackRef.track.grid.getxmin())), graph.Y(this.trackRef.track.grid.Y(0)), color);
                            }
                            else
                                if (ch1 != ch2) {
                                    color = 'red';
                                    let xstart = (this.grid.getxmin() + index);
                                    let xend = this.trackRef.track.grid.X(index + this.trackRef.track.grid.getxmin());
                                    drawLine(ctx, graph.X(this.grid.X(xstart)), graph.Y(this.grid.Y(0)), graph.X(this.grid.X(xend)), graph.Y(this.trackRef.track.grid.Y(0)), color);
                                }
                        }
                    }

                }
            }
            this.grid.rescale();

            drawLine(ctx, graph.X(this.grid.X(this.xi)), graph.Y(this.grid.Y(0)) + 10, graph.X(this.grid.X(this.xf)), graph.Y(this.grid.Y(0)) + 10, 'magenta', 1, 'round')
            if (trackScreenWidth > 100 && screencell > 0.005) {

                let deg = 0;
                if (this.strand) {
                    if (this.strand === (-1) || this.strand === '-1') {
                        deg = 3.14159;
                    }
                    let increment = (this.xf - this.xi) / 5;
                    for (let incr = this.xi; incr < this.xf - increment; incr += increment) {
                        drawArrowhead(ctx, graph.X(this.grid.X((incr))) + 100, graph.Y((this.grid.Y(-20))), deg, 16, 20, 'rgba(0,20,200,0.3)')
                    }
                }
                if (this.strand >= 0) {
                    this.annotations = this.annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
                } else {
                    this.annotations = this.annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });
                }

                let i = 1;
                let exonIndex = 0;
                let stopIndex = 0;
                let cstart = 0;
                let t = null;
                for (let a of this.annotations) {

                    a.xf = Math.floor(a.xf);
                    a.xi = Math.floor(a.xi);
                    if (a.type === 'Translation') {
                        stopIndex = Math.abs(Math.floor(a.gxf) - Math.floor(a.gxi));
                        t = a;
                    }
                }

                if (this.showAnnotaions) {
                    for (let a of this.annotations) {

                        a.gxi = Math.floor(a.gxi)
                        a.gxf = Math.floor(a.gxf)
                        a.xi = Math.floor(a.xi)
                        a.xf = Math.floor(a.xf)

                        if (a.type === 'Exon') {
                            a.index = i++;
                            await a.drawPlot(plateTrack, this, ctx);
                            if (screencell > 30 && exonIndex < stopIndex) {
                                if (this.strand < 0) {
                                    if (a.xf > t.xi && a.xi < t.xi) {
                                        cstart = t.xi;
                                        exonIndex = 1;
                                        for (let _i = t.xi - 1; _i >= a.xi; _i--) {
                                            drawString(ctx, '  ' + (exonIndex) + '  ', Math.floor(graph.X(this.grid.X(_i))), graph.Y(this.grid.Y(-0.05)), '', this.detail_ffont6);
                                            exonIndex++;
                                            if (exonIndex > stopIndex)
                                                break;

                                        }
                                    } else if (t.xf < a.xf && t.xf > a.xi) {
                                        for (let _i = a.xf; _i >= t.xf; _i--) {
                                            drawString(ctx, '  ' + (exonIndex) + '  ', Math.floor(graph.X(this.grid.X(_i))), graph.Y(this.grid.Y(-0.05)), 'lightRed', this.detail_ffont6);
                                            exonIndex++;
                                            if (exonIndex > stopIndex)
                                                break;

                                        }
                                    } else {
                                        for (let _i = a.xf; _i >= a.xi; _i--) {
                                            drawString(ctx, '  ' + (exonIndex) + '  ', Math.floor(graph.X(this.grid.X(_i))), graph.Y(this.grid.Y(-0.05)), 'lightRed', this.detail_ffont6);
                                            exonIndex++;
                                            if (exonIndex > stopIndex)
                                                break;

                                        }
                                    }
                                }
                                else {

                                    if (a.xf > t.xi && a.xi < t.xi) {
                                        exonIndex = 1;
                                        for (let _i = t.xi; _i <= a.xf; _i++) {
                                            drawString(ctx, '  ' + (exonIndex) + '  ', Math.floor(graph.X(this.grid.X(_i))), graph.Y(this.grid.Y(-0.05)), 'lightBlue', this.detail_ffont6);
                                            exonIndex++;
                                            if (exonIndex > stopIndex)
                                                break;
                                        }
                                    } else if (t.xf < a.xf && t.xf > a.xi) {
                                        for (let _i = a.xi; _i <= t.xf; _i++) {
                                            drawString(ctx, '  ' + (exonIndex) + '  ', Math.floor(graph.X(this.grid.X(_i))), graph.Y(this.grid.Y(-0.05)), 'lightBlue', this.detail_ffont6);
                                            exonIndex++;
                                            if (exonIndex > stopIndex)
                                                break;

                                        }
                                    } else {
                                        for (let _i = a.xi; _i <= a.xf; _i++) {
                                            drawString(ctx, '  ' + (exonIndex) + '  ', Math.floor(graph.X(this.grid.X(_i))), graph.Y(this.grid.Y(-0.05)), 'lightBlue', this.detail_ffont6);
                                            exonIndex++;
                                            if (exonIndex > stopIndex)
                                                break;

                                        }
                                    }

                                }
                            }
                            let offset = 0;

                            const totalPoints = 3;
                            const interval = Math.abs(a.xf - a.xi) / (totalPoints - 1);
                            if (screencell > 0.5) {
                                for (let i = 1; i < totalPoints - 1; i++) {
                                    let xvalue = a.xi + offset + i * interval;
                                    if (i === 0) {
                                        xvalue = a.xi + offset + i * interval;
                                    }
                                    drawArrowhead(ctx, graph.X(this.grid.X((xvalue))), graph.Y(this.grid.Y(10)), deg, 6, 4, 'rgba(100, 100, 200, 0.5)')
                                    drawArrowhead(ctx, graph.X(this.grid.X((xvalue))), graph.Y(this.grid.Y(10)), deg, 6, 4, 'rgba(100, 100, 200, 0.5)')
                                }
                            }
                        } else {
                            await a.drawPlot(plateTrack, this, ctx);
                        }

                    }
                }

                const groups = {};
                let annot = this.getAnnotationsInRange(twcxs - 10000, twcxf + 10000)
                annot.forEach(annotation => {
                    if (!groups[annotation.name]) {
                        groups[annotation.name] = [];
                    }
                    groups[annotation.name].push(annotation.xi);
                });
                if (this.showArc && typeof groups === 'object' && groups !== null && ctx && graph && this.grid) {
                    const groupNames = Object.keys(groups);
                    groupNames.forEach((name, index) => {
                        const xis = (Array.isArray(groups[name]) ? groups[name].slice() : []).sort((a, b) => a - b);
                        if (xis.length < 2) return;

                        const color = `hsl(${360 * index / groupNames.length}, 100%, 50%, 0.2)`;
                        let randy = 10;

                        for (let i = 0; i < xis.length - 1; i++) {
                            try {
                                const x1Raw = this.grid.X?.(xis[i]);
                                const x2Raw = this.grid.X?.(xis[i + 1]);
                                if (typeof x1Raw !== 'number' || typeof x2Raw !== 'number') continue;

                                const x1 = graph.X(x1Raw);
                                const x2 = graph.X(x2Raw);
                                const radius = (x2 - x1) / 2;

                                if (!isFinite(radius) || radius <= 0) continue;

                                const xCenter = (x1 + x2) / 2;
                                const yBase = this.grid.yi + this.grid.height;
                                const yCenter = graph.Y(yBase);

                                if (!isFinite(xCenter) || !isFinite(yCenter)) continue;

                                ctx.beginPath();
                                ctx.strokeStyle = color;
                                ctx.lineWidth = 1;
                                ctx.arc(xCenter, yCenter, radius, 0, Math.PI, true);
                                ctx.stroke();

                            } catch (err) {
                                console.warn(`Failed to draw arc for group "${name}" at index ${i}:`, err);
                            }
                        }
                    });

                }

                if (this.showPlots) {
                    for (let p of this.plots) {
                        p.draw(graph, this.grid)
                    }
                }
                let y = 0;

                if (ctx)
                    ctx.font = this.detail_ffont7;

                if (screencell > 1) {
                    for (let o of visOligos) {
                        o.showOfftargets = this.showOfftargets;

                        o.draw(graph, this.grid, y);
                    }
                } else {
                    for (let o of visOligos) {

                        if (o.highlight__) {
                            graph.drawVerticalLineScreen(graph.X(this.grid.X(o.xi)), graph.Y(this.grid.Y(o.y)), 2, o.highlight__, 1)
                            graph.drawVerticalLineScreen(graph.X(this.grid.X(o.xf)), graph.Y(this.grid.Y(o.y)), 2, o.highlight__, 1)
                        }
                        if (o.drawIcon)
                            o.drawIcon(graph, this.grid)
                        else
                            drawLine(ctx, graph.X(this.grid.X(o.xi)), graph.Y(this.grid.Y(o.y)), graph.X(this.grid.X(o.xf)), graph.Y(this.grid.Y(o.y)), 'gray', 1, 'round')
                    }

                }
            } else {
            }
            if ((screencell) > 5) {
                let x_world_start = (graph.X(-100));
                let x_world_end = (graph.width + 200);
                let tx_world_start = Math.floor(this.grid.Xwc(x_world_start - this.grid.xi * 2));
                let tx_world_end = Math.floor(this.grid.Xwc(x_world_end - this.grid.xi * 2));

                tx_world_start = 0;
                tx_world_end = this.sequence.length;

                if (tx_world_end < tx_world_start) {
                    let t = tx_world_end;
                    tx_world_end = tx_world_start;
                    tx_world_start = t;
                }
                if (this.sequence) {
                    let pseq = -1;

                    for (let index = Math.floor(tx_world_start); index < Math.floor(tx_world_end); index++) {

                        let seq_index = Math.floor(index - Math.floor(this.xi));

                        if (seq_index < this.sequence.length && this.sequence[seq_index]) {
                            if (screencell > 30 && screencell > 0.05) {

                                drawString(
                                    ctx,
                                    (this.grid.xmin + seq_index) + '',
                                    graph.X(this.grid.X(Math.floor(index))),
                                    graph.Y(this.grid.Y(-20.0)),
                                    'lightGray',
                                    this.detail_ffont6
                                );

                                drawString(
                                    ctx,
                                    ' ' + (seq_index + 1) + ' ',
                                    graph.X(this.grid.X(Math.floor(index))),
                                    graph.Y(this.grid.Y(-20.0)),
                                    'darkGreen',
                                    this.detail_ffont6
                                );

                                if (this.orf && this.orf.cdsi) {
                                    for (let oor of this.orf.cdsi) {
                                        let color = codon_colors(oor.aa);
                                        if (oor.index === index) {
                                            if (oor.ci === 1) {

                                                drawString(
                                                    ctx,
                                                    oor.aa,
                                                    graph.X(this.grid.X(Math.floor(index) + 0.2)),
                                                    graph.Y(this.grid.Y(0.15)),
                                                    '#' + color,
                                                    this.detail_ffont4
                                                );

                                                drawString(
                                                    ctx,
                                                    (oor.codon_index + 1) + '',
                                                    graph.X(this.grid.X(Math.floor(index) + 0.2)),
                                                    graph.Y(this.grid.Y(0.30)),
                                                    '#' + color,
                                                    this.detail_ffont6
                                                );
                                            }
                                        }
                                    }
                                }

                                const baseFont = (this.highlightIndex > 0 && this.highlightIndex === index)
                                    ? this.detail_ffont_large
                                    : this.detail_ffont;

                                drawString(
                                    ctx,
                                    this.sequence[seq_index],
                                    graph.X(this.grid.X(Math.floor(index) + 0.2)),
                                    graph.Y(this.grid.Y(0.012)),
                                    'black',
                                    baseFont
                                );

                                let deg = 0;
                                if (this.strand === (-1) || this.strand === '-1') {
                                    deg = 3.14159;
                                }

                            } else {
                                if (this.orf && this.orf.cdsi) {
                                    for (let oor of this.orf.cdsi) {
                                        if (oor.index === index) {
                                            let color = codon_colors(oor.aa);
                                            if (oor.ci === 1) {

                                                drawString(
                                                    ctx,
                                                    oor.aa,
                                                    graph.X(this.grid.X(Math.floor(index) + 0.2)),
                                                    graph.Y(this.grid.Y(0.15)),
                                                    '#' + color,
                                                    this.font
                                                );

                                                drawString(
                                                    ctx,
                                                    (oor.codon_index + 1) + '',
                                                    graph.X(this.grid.X(Math.floor(index) + 0.2)),
                                                    graph.Y(this.grid.Y(0.30)),
                                                    '#' + color,
                                                    this.detail_ffont6
                                                );
                                            }
                                        }
                                    }
                                }

                                let deg = 0;
                                if (this.strand === (-1) || this.strand === '-1') {
                                    deg = 3.14159;
                                }

                                if (seq_index % 100 === 0) {
                                    drawArrowhead(
                                        ctx,
                                        graph.X(this.grid.X(seq_index)),
                                        graph.Y(this.grid.Y(0)),
                                        deg,
                                        6,
                                        4,
                                        'lightGray'
                                    );
                                }

                                drawString(
                                    ctx,
                                    this.sequence[seq_index],
                                    graph.X(this.grid.X(Math.floor(index) + 0.2)),
                                    graph.Y(this.grid.Y(0)),
                                    'navy',
                                    this.ffont
                                );
                            }
                        } else {

                            drawString(
                                ctx,
                                '-',
                                graph.X(this.grid.X(index)),
                                graph.Y(this.grid.Y(0)),
                                'gray',
                                this.detail_ffont6
                            );
                        }

                        for (let o of visOligos) {
                            o.showOfftargets = this.showOfftargets;
                            o.drawDetail(graph, this.grid, index, y + 0.15);
                        }

                        let yshiftindex = 0;
                        for (let sid of snpsv) {
                            await sid.draw(graph, this.grid, (0.15 + y) + 0.15 * yshiftindex);
                            await sid.drawDetail(graph, this.grid, index, (0.05 + y) + 0.15 * yshiftindex);
                            yshiftindex += 0.15;
                            if (yshiftindex > 1) {
                                yshiftindex = 0;
                            }
                        }
                    }
                }

            } else {
                if (trackScreenWidth > 40 && screencell > 0.05) {
                    let increment = (this.grid.xmax - this.grid.xmin) / 4;

                    for (let idx = this.grid.xmin; idx < this.grid.xmax; idx += increment) {
                        drawVerticalLine(ctx, graph.X(Math.floor(this.grid.X(idx))), graph.Y(this.grid.Y(0)), graph.screenHeight(this.grid.height), 'lightGray', 1);

                    }
                    // ONE genomic coordinate, centred over the track, rather than a number on
                    // every gridline. Four of them repeated the same kind of information at four
                    // positions and crowded the top edge, which is also where the caption tab and
                    // the track's layers sit. One says where you are; the gridlines and the tab's
                    // own range say how wide.
                    {
                        const __mid = (this.grid.xmin + this.grid.xmax) / 2;
                        drawString(
                            ctx,
                            Math.floor(__mid) + "",
                            graph.X(this.grid.X(__mid)),
                            graph.Y(this.grid.Y(this.grid.ymax)),
                            'lightGray',
                            this.detail_ffont7
                        );
                    }

                    if (this.highlight_features) {
                        for (let a of this.annotations) {
                            if (this.highlight_features && this.highlight_features['annotations.' + a.type] != null) {
                                let hl = this.highlight_features['annotations.' + a.type];
                                if (hl) {
                                    hl(graph, this.grid.X(a.xi), (a.xf), (0));
                                }
                            }
                        }
                    }

                    if (this.showPlots) {
                        for (let p of this.plots) {
                            p.draw(graph, this.grid)
                        }
                    }

                    let oin = 0;
                    let y = 0;
                    if (ctx) ctx.font = this.detail_ffont7;

                    if (screencell > 0.3) {
                        for (let o of visOligos) {
                            if (o) {
                                o.showOfftargets = this.showOfftargets;
                                await o.draw(graph, this.grid, y);
                            }
                        }
                    }
                }

            }

            let oindex = 0;
            if (snpsv.length > 0) {
                let modv = (Math.abs(snpsv.length) / 1000 | 0);

                if (modv === 0) {
                    modv = 1;
                } else
                    modv = Math.ceil(modv / 10) * 10;
                for (let sid of snpsv) {
                    if (oindex % modv === 0) {
                        await sid.draw(graph, this.grid, 0.1)

                    }

                    oindex++;
                }
            }

            if (this.sequence) {
                if (this.markstart != null && this.markstart >= 0 && this.markend != null && this.markend > this.markstart) {
                    let x_world_start = graph.Xwc(0);
                    let x_world_end = graph.Xwc(graph.width);
                    let tx_world_start = this.grid.Xwc(x_world_start - this.grid.xi * 2);
                    let tx_world_end = this.grid.Xwc(x_world_end - this.grid.xi * 2);
                    if (screencell > 30) {
                        for (let index = Math.floor(tx_world_start); index < Math.floor(tx_world_end); index++) {
                            let seq_index = index - Math.floor(this.xi);
                            if (seq_index < this.sequence.length && this.sequence[seq_index]) {
                                drawString(
                                    ctx,
                                    this.sequence[seq_index],
                                    graph.X(this.grid.X(Math.floor(index) + 0.2)),
                                    graph.Y(this.grid.Y(100)),
                                    'purple',
                                    this.detail_ffont4
                                );
                            }
                        }

                    } else if (screencell > 5) {

                        for (let index = Math.floor(this.markstart); index < Math.floor(this.markend); index++) {
                            let seq_index = index - Math.floor(this.xi);
                            if (seq_index < this.sequence.length && this.sequence[seq_index]) {

                                drawString(
                                    ctx,
                                    this.sequence[seq_index],
                                    graph.X(this.grid.X(Math.floor(index) + 0.2)),
                                    graph.Y(this.grid.Y(0.012)),
                                    'magenta',
                                    this.ffont
                                );

                            } else {
                                drawString(
                                    ctx,
                                    '',
                                    graph.X(this.grid.X(index)),
                                    graph.Y(this.grid.Y(0)),
                                    'magenta',
                                    this.detail_ffont6
                                );
                            }
                        }

                    }
                    // Zoomed out past the sequence letters there is deliberately NOTHING drawn
                    // across the selection: the two arrow heads mark its ends on their own. The
                    // wide translucent band that used to run between them read as a line joining
                    // the arrows, which is exactly what the arrow-heads-only look is avoiding.
                }
            }

            if (this.markstart != null && this.markend != null && this.markstart >= 0 && this.markend > this.markstart) {
                let midpoint = this.grid.getymin() + ((this.grid.getymax() - this.grid.getymin()) / 2);

                // No bracket lines: the selection window is marked by the two orange arrow
                // heads below the track (drawn further down) and nothing else. Each head is
                // grabbable to resize that edge — see gene.js __hitSelectionArrow().

                drawString(
                    ctx,
                    Math.floor(this.markend - this.markstart) + "",
                    graph.X(this.grid.X(this.markend)),
                    graph.Y(this.grid.Y(50)),
                    'black',
                    this.detail_ffont6
                );

                drawString(
                    ctx,
                    (this.markend - this.markstart) + "",
                    graph.X(this.grid.X((this.grid.X(this.markstart) + this.grid.X(this.markend)) / 2)),
                    graph.Y(this.grid.Y(midpoint)),
                    'black',
                    this.detail_ffont6
                );

                let screenStartX = graph.X(this.grid.X(Math.floor(this.markstart)));
                let screenEndX = graph.X(this.grid.X(this.markend));
                let yPosition = graph.Y(this.grid.Y(-20));
                // Selected-sequence arrow — tropical orange with a soft drop shadow
                // so it pops off the canvas. save/restore keeps the shadow from
                // bleeding onto everything drawn after it.
                ctx.save();
                let arrowheadLength = 15;
                let arrowheadWidth = 7;

                // Arrow HEADS only — no connecting line body. Each head is a grab handle for
                // resizing that edge, so it is drawn to read as a raised, physical control:
                // a cast shadow lifts it off the canvas, a vertical gradient gives the face
                // curvature (lit from above), a dark edge keeps it crisp against pale tracks,
                // and a specular streak along the top sells the highlight.
                const __drawGrabHead = (tipX, dir) => {
                    const L = arrowheadLength, H = arrowheadWidth;
                    ctx.save();
                    // Cast shadow — warm rather than neutral black, so it reads as depth under
                    // an orange object instead of dirt.
                    ctx.shadowColor = 'rgba(120,52,0,0.50)';
                    ctx.shadowBlur = 9;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 3;
                    const g = ctx.createLinearGradient(0, yPosition - H, 0, yPosition + H);
                    g.addColorStop(0, '#ffc07a');     // lit top
                    g.addColorStop(0.45, '#ff8c2f');  // body
                    g.addColorStop(1, '#dd5f14');     // shaded underside
                    ctx.beginPath();
                    ctx.moveTo(tipX, yPosition);
                    ctx.lineTo(tipX + dir * L, yPosition - H);
                    ctx.lineTo(tipX + dir * L, yPosition + H);
                    ctx.closePath();
                    ctx.fillStyle = g;
                    ctx.fill();
                    // Edge and highlight must not inherit the cast shadow or they smear.
                    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
                    ctx.lineJoin = 'round';
                    ctx.lineWidth = 1.25;
                    ctx.strokeStyle = '#9c4409';
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(tipX + dir * (L * 0.20), yPosition - H * 0.26);
                    ctx.lineTo(tipX + dir * (L * 0.84), yPosition - H * 0.70);
                    ctx.lineWidth = 1.5;
                    ctx.lineCap = 'round';
                    ctx.strokeStyle = 'rgba(255,255,255,0.60)';
                    ctx.stroke();
                    ctx.restore();
                };
                __drawGrabHead(screenStartX, 1);    // start head opens to the right
                __drawGrabHead(screenEndX, -1);     // end head opens to the left
                ctx.restore();

                drawString(
                    ctx,
                    "  [" + parseInt(this.markstart) + "]",
                    graph.X(this.grid.X(this.markstart)),
                    graph.Y(this.grid.Y(50)),
                    'navy',
                    this.detail_ffont6
                );

            }

            if (this.targetPhase != null) {

                let fifthpoint = (this.grid.getymax() - this.grid.getymin()) / 5;
                if (this.targetPhase == -1) {
                    drawString(
                        ctx,
                        "Haplotype to target",
                        graph.X((this.grid.xi + this.grid.width + 10)),
                        graph.Y((-1 * fifthpoint)),
                        'blue',
                        this.detail_ffont7
                    );
                } else if (this.targetPhase == 1) {
                    drawString(
                        ctx,
                        "Haplotype to target",
                        graph.X((this.grid.xi + this.grid.width + 10)),
                        graph.Y((fifthpoint)),
                        'blue',
                        this.detail_ffont7
                    );
                }
            }

            if (this.showName && screencell > 0.05) {
                drawString(
                    ctx,
                    this.name,
                    graph.X((this.grid.xi - 100)),
                    graph.Y(this.grid.Y(0.1)),
                    'lightBlue',
                    this.detail_ffont7
                );
            }

            if (this.showResizeBar) {
                if (!this.description) {
                    this.description = '';
                }

                drawString(
                    ctx,
                    this.name,
                    graph.X(this.grid.X(0)),
                    graph.Y(this.grid.Y(this.grid.ymax - (this.grid.ymax - this.grid.ymin) / 2)),
                    'blue',
                    this.detail_ffont7
                );

                if (screencell > 0.05 && this.chr) {
                    // Species leads in bold; the locus and description follow, quieter. A track
                    // whose organism could not be read from its id simply has no species part
                    // rather than a guessed one -- see speciesFromTranscriptId in lib/core.js.
                    let __detail = 'chr' + this.chr + ':' + this.xi + '-' + this.xf
                        + '  ·  ' + this.getKB() + ' KB';
                    let __desc = ('' + (this.description == null ? '' : this.description)).trim();
                    // Long gene/transcript descriptions would run the tab off the canvas.
                    if (__desc.length > 48) __desc = __desc.slice(0, 47) + '…';
                    if (__desc) __detail += '  ·  ' + __desc;
                    drawTrackTab(
                        ctx,
                        this.species || '',
                        __detail,
                        graph.X((this.grid.xi)),
                        graph.Y(this.grid.Y(this.grid.ymax))
                    );
                }

                fillTranslucentRect(
                    ctx,
                    graph.X(this.grid.xi),
                    graph.Y(this.grid.yi + this.grid.height),
                    graph.screenWidth(this.grid.width),
                    graph.screenHeight(this.grid.height)
                );
            }

            if (this.trackRef != null && this.trackRef.track) {
                this.trackRef.track.draw(graph);
            }

            if (this.showOligoMap) {
                for (let o of this.oligos) {
                    graph.drawVerticalLineScreen(
                        graph.X(this.grid.X(o.xi)),
                        graph.Y(this.grid.Y(o.y)),
                        5,
                        "red",
                        2
                    );
                    graph.drawVerticalLineScreen(
                        graph.X(this.grid.X(o.xf)),
                        graph.Y(this.grid.Y(o.y)),
                        5,
                        "magenta",
                        2
                    );
                }
            }

            for (let structure of this.structures) {
                if (!structure.pos || structure.pos.length === 0) {

                } else {
                    if (this.markstart && this.markend && this.markstart >= 0 && this.markend > 0) {
                        if (this.markstart >= (this.xi + structure.xi) && this.markstart < (this.xi + structure.xf)) {
                            structure.highlightRange(this.markstart - this.xi - structure.xi, this.markend - this.xi - structure.xi);
                        } else {
                            structure.highlightRange(-1, -1);
                        }
                    }
                    structure.draw(
                        graph,
                        this,
                        this.grid.X(structure.xi),
                        this.grid.Y(this.grid.yi),
                        this.markstart,
                        this.markend
                    );
                }
            }
            this.drawButtons(ctx, plateTrack)

        }

    }
    let TrackRef = class TrackRef {
        xi;
        xf;
        track;
        map = [];
        genomeMap = [];
        showMismatches = false;
        name;

        constructor(_track, _xi, _xf) {
            this.xi = _xi;
            this.xf = _xf;
            this.name = _track.name;
            this.track = _track;
        }
    }

    resolve({ Track, TrackRef });
});
