return new Promise(async (resolve, reject) => {
    try {
        const MGrid = await exec('flexigraph/grid.js');
        const Annotation = await exec('flexigraph/annotation.js');
        const Glyph = await exec('baja/draw/glyph.js');

        const DEFAULT_CHROMOSOMES = [
            { name: 'chr1', length: 248956422 },
            { name: 'chr2', length: 242193529 },
            { name: 'chr3', length: 198295559 },
            { name: 'chr4', length: 190214555 },
            { name: 'chr5', length: 181538259 },
            { name: 'chr6', length: 170805979 },
            { name: 'chr7', length: 159345973 },
            { name: 'chr8', length: 145138636 },
            { name: 'chr9', length: 138394717 },
            { name: 'chr10', length: 133797422 },
            { name: 'chr11', length: 135086622 },
            { name: 'chr12', length: 133275309 },
            { name: 'chr13', length: 114364328 },
            { name: 'chr14', length: 107043718 },
            { name: 'chr15', length: 101991189 },
            { name: 'chr16', length: 90338345 },
            { name: 'chr17', length: 83257441 },
            { name: 'chr18', length: 80373285 },
            { name: 'chr19', length: 58617616 },
            { name: 'chr20', length: 64444167 },
            { name: 'chr21', length: 46709983 },
            { name: 'chr22', length: 50818468 },
            { name: 'chrX', length: 156040895 },
            { name: 'chrY', length: 57227415 },
            { name: 'chrM', length: 16569 }
        ];

        function formatBp(n) {
            const v = Math.abs(Number(n) || 0);
            if (v >= 1e9) return `${(v / 1e9).toFixed(2)} Gb`;
            if (v >= 1e6) return `${(v / 1e6).toFixed(2)} Mb`;
            if (v >= 1e3) return `${(v / 1e3).toFixed(2)} Kb`;
            return `${v} bp`;
        }

        function clamp(v, min, max) {
            return Math.max(min, Math.min(max, v));
        }

        function normalizeChromosomes(chromosomes) {
            let cursor = 0;
            return (chromosomes || DEFAULT_CHROMOSOMES).map((chr, index) => {
                const length = Math.max(1, Math.floor(chr.length));
                const start = cursor;
                const end = cursor + length - 1;
                cursor = end + 1;
                return {
                    index,
                    name: chr.name,
                    length,
                    color: chr.color || `hsl(${(index * 47) % 360} 55% 58%)`,
                    start,
                    end
                };
            });
        }

        let ChromosomeTrack = class ChromosomeTrack {
            name = 'chr';
            track_type = 'chromosome';
            annotations = [];
            snpindels = [];
            oligos = [];
            icons = [];
            chr = null;
            species = null;
            sequence = null;
            description = null;
            y = 1;
            strand = 1;
            color = 'rgb(153,159,198)';
            default_track_height = -1.5;
            showName = true;
            hideTrackCoords = false;
            markstart = -1;
            markend = -1;
            genomeOffset = 0;
            sequenceProvider = null;

            constructor(name, xi, xf, y = 1, strand = 1, opts = {}) {
                this.name = String(name || 'chr');
                this.xi = Math.floor(xi);
                this.xf = Math.floor(xf);
                this.y = y;
                this.strand = strand;
                this.chr = opts.chr || this.name;
                this.species = opts.species || null;
                this.color = opts.color || this.color;
                this.description = opts.description || null;
                this.genomeOffset = opts.genomeOffset || 0;
                this.sequenceProvider = opts.sequenceProvider || null;
                this.sequence = opts.sequence || null;

                this.tgraph = new MGrid(0, y, this.xf - this.xi + 1, this.default_track_height);
                this.tgraph.xi = 0;
                this.tgraph.setxmin(this.xi);
                this.tgraph.setxmax(this.xf);
                this.tgraph.setymin(0);
                this.tgraph.setymax(1);
                this.tgraph.setSize(this.xf - this.xi + 1, this.default_track_height);
                this.tgraph.setInset(0, 0);
                this.tgraph.height = this.default_track_height;
                this.tgraph.rescale();
            }

            add(annotation) {
                this.annotations.push(annotation);
                return annotation;
            }

            addIcon(glyph) {
                this.icons.push(glyph);
            }

            setSequence(sequence) {
                this.sequence = sequence;
            }

            async getSequenceRange(start, end) {
                const s = Math.max(this.xi, Math.floor(start));
                const e = Math.min(this.xf, Math.floor(end));
                if (e < s) return '';

                if (typeof this.sequence === 'string' && this.sequence.length >= (this.xf - this.xi + 1)) {
                    return this.sequence.substring(s - this.xi, e - this.xi + 1);
                }

                if (typeof this.sequenceProvider === 'function') {
                    return await this.sequenceProvider({
                        chr: this.chr,
                        start: s,
                        end: e,
                        genomeStart: this.genomeOffset + (s - this.xi),
                        genomeEnd: this.genomeOffset + (e - this.xi)
                    });
                }

                return '';
            }

            getVisibleAnnotations(start = this.xi, end = this.xf) {
                return this.annotations.filter(a => a && a.xf >= start && a.xi <= end);
            }

            zoomTo(start, end) {
                this.tgraph.setxmin(start);
                this.tgraph.setxmax(end);
                this.tgraph.setSize(end - start + 1, this.default_track_height);
                this.tgraph.rescale();
            }

            draw(graph) {
                const ctx = graph.canvas.getCTX();
                if (!ctx) return;

                const x0 = Math.floor(this.tgraph.X(this.xi));
                const x1 = Math.floor(this.tgraph.X(this.xf));
                const yMid = this.tgraph.Y(0.5);

                graph.drawLine(x0, yMid, x1, yMid, this.color, 8);

                const visible = this.getVisibleAnnotations(
                    Math.floor(this.tgraph.Xwc(graph.Xwc(0) - this.tgraph.xi * 2)),
                    Math.floor(this.tgraph.Xwc(graph.Xwc(graph.grid.width) - this.tgraph.xi * 2))
                );

                for (const a of visible) {
                    const ax0 = Math.floor(this.tgraph.X(a.xi));
                    const ax1 = Math.floor(this.tgraph.X(a.xf));
                    graph.drawLine(ax0, yMid, ax1, yMid, a.color || '#111827', 14);
                    if (a.name && Math.abs(ax1 - ax0) > 24) {
                        graph.drawString(a.name, (ax0 + ax1) / 2, this.tgraph.Y(0.2), a.textColor || 'black', '11px Arial');
                    }
                }

                if (this.showName) {
                    graph.drawString(
                        `${this.name} (${formatBp(this.xf - this.xi + 1)})`,
                        x0 + 6,
                        this.tgraph.Y(0.05),
                        'black',
                        '12px Arial'
                    );
                }

                for (const icon of this.icons) {
                    if (icon && typeof icon.draw === 'function') {
                        icon.draw(graph, this.tgraph, ctx);
                    }
                }
            }
        };

        let GenomeTrackRef = class GenomeTrackRef {
            constructor(genomeTrack) {
                this.name = genomeTrack.name;
                this.track = genomeTrack;
                this.chromosomes = genomeTrack.chromosomes.map(c => ({ ...c }));
                this.totalLength = genomeTrack.totalLength;
            }
        };

        let GenomeTrack = class GenomeTrack {
            name = 'genome';
            track_type = 'genome';
            species = 'Homo sapiens';
            assembly = 'GRCh38';
            y = 1;
            strand = 1;
            color = '#64748b';
            showName = true;
            showLabels = true;
            showCytobands = false;
            chromosomeGap = 10000000;
            annotations = [];
            chromosomeTracks = [];
            sequenceProvider = null;
            activeChromosome = null;

            constructor(name = 'genome', y = 1, opts = {}) {
                this.name = String(name);
                this.y = y;
                this.species = opts.species || this.species;
                this.assembly = opts.assembly || this.assembly;
                this.sequenceProvider = opts.sequenceProvider || null;
                this.chromosomeGap = Number.isFinite(opts.chromosomeGap) ? opts.chromosomeGap : this.chromosomeGap;

                this.chromosomes = normalizeChromosomes(opts.chromosomes || DEFAULT_CHROMOSOMES);
                this.totalLength = this.chromosomes.length
                    ? this.chromosomes[this.chromosomes.length - 1].end + 1
                    : 0;

                this.xi = 0;
                this.xf = this.totalLength - 1;

                this.tgraph = new MGrid(0, y, this.totalLength, -2);
                this.tgraph.xi = 0;
                this.tgraph.setxmin(this.xi);
                this.tgraph.setxmax(this.xf);
                this.tgraph.setymin(0);
                this.tgraph.setymax(1);
                this.tgraph.setSize(this.totalLength, -2);
                this.tgraph.setInset(0, 0);
                this.tgraph.height = -2;
                this.tgraph.rescale();

                this.trackRef = new GenomeTrackRef(this);
                this._buildChromosomeTracks();
            }

            _buildChromosomeTracks() {
                this.chromosomeTracks = this.chromosomes.map(chr => new ChromosomeTrack(
                    chr.name,
                    chr.start,
                    chr.end,
                    this.y,
                    1,
                    {
                        chr: chr.name,
                        species: this.species,
                        color: chr.color,
                        genomeOffset: chr.start,
                        description: `${chr.name} in ${this.assembly}`,
                        sequenceProvider: this.sequenceProvider
                    }
                ));
            }

            getChromosome(name) {
                return this.chromosomes.find(c => c.name === name) || null;
            }

            getChromosomeForGenomeIndex(index) {
                const x = Math.floor(index);
                return this.chromosomes.find(c => x >= c.start && x <= c.end) || null;
            }

            genomeToChromosome(index) {
                const chr = this.getChromosomeForGenomeIndex(index);
                if (!chr) return null;
                return {
                    chr: chr.name,
                    position: index - chr.start + 1,
                    zeroBasedPosition: index - chr.start,
                    chromosome: chr
                };
            }

            chromosomeToGenome(chrName, position) {
                const chr = this.getChromosome(chrName);
                if (!chr) return -1;
                return chr.start + Math.max(0, Math.floor(position));
            }

            setActiveChromosome(chrName) {
                const chr = this.getChromosome(chrName);
                if (!chr) return null;
                this.activeChromosome = chr.name;
                this.zoomTo(chr.start, chr.end);
                return chr;
            }

            zoomTo(start, end) {
                const s = clamp(Math.floor(start), this.xi, this.xf);
                const e = clamp(Math.floor(end), this.xi, this.xf);
                this.tgraph.setxmin(Math.min(s, e));
                this.tgraph.setxmax(Math.max(s, e));
                this.tgraph.setSize(Math.max(1, Math.abs(e - s) + 1), -2);
                this.tgraph.rescale();
            }

            resetZoom() {
                this.activeChromosome = null;
                this.zoomTo(this.xi, this.xf);
            }

            add(annotation) {
                if (!annotation) return null;

                if (!(annotation instanceof Annotation) && annotation.type) {
                    const a = new Annotation(
                        annotation.type,
                        annotation.name || annotation.type,
                        annotation.xi,
                        annotation.xf,
                        annotation.strand || 1,
                        annotation.annotations || []
                    );
                    a.color = annotation.color;
                    a.chr = annotation.chr;
                    annotation = a;
                }

                this.annotations.push(annotation);

                const chrName = annotation.chr || this.getChromosomeForGenomeIndex(annotation.xi)?.name;
                const chrTrack = this.chromosomeTracks.find(t => t.chr === chrName);
                if (chrTrack) chrTrack.add(annotation);
                return annotation;
            }

            addAnnotations(items = []) {
                for (const item of items) this.add(item);
            }

            getAnnotationsForChromosome(chrName) {
                return this.annotations.filter(a => (a.chr || this.getChromosomeForGenomeIndex(a.xi)?.name) === chrName);
            }

            async getSequenceRange(chrName, start, end) {
                const chr = this.getChromosome(chrName);
                if (!chr) return '';
                const chrTrack = this.chromosomeTracks.find(t => t.chr === chrName);
                if (!chrTrack) return '';
                return await chrTrack.getSequenceRange(chr.start + start, chr.start + end);
            }

            getGenomeSummary() {
                return {
                    name: this.name,
                    species: this.species,
                    assembly: this.assembly,
                    totalLength: this.totalLength,
                    chromosomeCount: this.chromosomes.length,
                    chromosomes: this.chromosomes.map(c => ({
                        name: c.name,
                        length: c.length,
                        start: c.start,
                        end: c.end
                    }))
                };
            }

            draw(graph) {
                const ctx = graph.canvas.getCTX();
                if (!ctx) return;

                const yMid = this.tgraph.Y(0.5);
                graph.drawLine(Math.floor(this.tgraph.X(this.xi)), yMid, Math.floor(this.tgraph.X(this.xf)), yMid, this.color, 6);

                for (const chr of this.chromosomes) {
                    const x0 = Math.floor(this.tgraph.X(chr.start));
                    const x1 = Math.floor(this.tgraph.X(chr.end));
                    graph.drawLine(x0, yMid, x1, yMid, chr.color, 14);

                    graph.drawVerticalLineScreen(x0, yMid - 12, 24, 'rgba(0,0,0,0.35)', 1);
                    graph.drawVerticalLineScreen(x1, yMid - 12, 24, 'rgba(0,0,0,0.35)', 1);

                    if (this.showLabels && Math.abs(x1 - x0) > 18) {
                        graph.drawString(chr.name, (x0 + x1) / 2, this.tgraph.Y(0.18), 'black', '11px Arial');
                    }
                }

                if (this.showName) {
                    graph.drawString(
                        `${this.name} · ${this.species} · ${this.assembly} · ${formatBp(this.totalLength)}`,
                        Math.floor(this.tgraph.X(this.xi)) + 8,
                        this.tgraph.Y(0.04),
                        'black',
                        '12px Arial'
                    );
                }
            }
        };

        resolve({ GenomeTrack, ChromosomeTrack, GenomeTrackRef });
    } catch (error) {
        reject(error);
    }
});
