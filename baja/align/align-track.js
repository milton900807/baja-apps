return new Promise(async (resolve, reject) => {
    let MGrid = await exec('flexigraph/grid.js')
    let SimpleMatch = await exec('baja/align/match-simple.js')

    let SeqObject = await exec('baja/align/seq-obj.js')
    let AlignmentMapGlyph = await exec('baja/align/alignment-map-glyph.js')
    let Scroll = await exec('flexigraph/scroll.js')

    let AlignTrack = class AlignTrack {
        name = 'untitled';
        xi;
        color = 'rgb(153,159,198)';
        y = 1;
        tgraph;
        showResizeBar = false;
        matches = []
        static PAGE_SIZE = 1000000;
        static WINDOW_SIZE = 12;
        scroll;
        expression_options;

        constructor(name, xi, xf, y) {
            this.name = name;
            this.xi = xi;
            this.y = y;
            this.tgraph = new MGrid(0, y, xf - xi, -2);
            this.tgraph.xi = 0;
            this.tgraph.yi = 10;
            this.tgraph.width = xf;
            this.tgraph.setxmax(xf);
            this.tgraph.setymax(10);
            this.tgraph.setxmin(xi);
            this.tgraph.setymin(0);
            this.tgraph.setInset(0, 0)
            this.tgraph.height = -10;
            this.tgraph.rescale();
            this.scroll = new Scroll(this.tgraph, AlignTrack.PAGE_SIZE + 10, AlignTrack.WINDOW_SIZE)
        }
        getMouseDownListener() {
            return this.scroll.getMouseDownListener();
        }
        getMouseMoveListener() {
            return this.scroll.getMouseMoveListener();
        }
        getMouseUpListener() {
            return this.scroll.getMouseUpListener();
        }
        longest = () => {
            return this.matches.reduce(
                function (a, b) {
                    return a.mlength() > b.mlength() ? a : b;
                }
            )
        }

        async test() {

        }

        async clear() {
            this.matches = [];
        }
        async exec(sequence, editDistance, selected_expression_tissues, genomes, mode) {
            this.expression_options = selected_expression_tissues;

            if (!mode) {
                mode = 'traceback'
            }
            let g = genomes.join ( ',')

            let oep = window["env"]["offtarget"];
            if ( !oep || oep.length <=0 ){
                oep = '/levenshtein'
            }
            let uri = `${oep}/run-off-targets?id=2322&sequence=${sequence}&editDistance=${editDistance}&genome=${g}&runMode=${mode}`;
            let r = await GETJSON(uri);
            console.log(uri);
            let oq = r.oligoQuery;
            if (!oq) {
                showModal({
                    wid: 'json',
                    data: JSON.stringify(r)
                })
                return;
            }
            let ots = null;
            for (let q of oq) {
                let id = q.id;
                ots = q.offtarget;
                for (let i of ots) {

                    let input = new SeqObject(i.qglyph);
                    let target = new SeqObject(i.sglyph);
                    target.start = i.start;
                    target.end = i.end;
                    target.strand = i.strand;
                    target.genome = i.genome.substring(i.genome.indexOf('/') + 1, i.genome.indexOf('.'));
                    target.chromosome = i.chr;
                    let am = new AlignmentMapGlyph(i.gglyph);
                    this.matches.push(new SimpleMatch(input, target, am))
                    if (this.matches.length >= AlignTrack.PAGE_SIZE) {

                        break;

                    }
                }
            }

            this.scroll.scrollmax = this.matches.length;
            return this.matches;
        }

        async draw(graph) {
            let screencell = graph.screenWidth(this.tgraph.screenWidth(1))
            if (this.matches != null && this.matches.length > 0) {
                this.tgraph.xmin = -1;
                this.tgraph.xmax = 60;

            } else {
                graph.dashedRect(graph.X(this.tgraph.xi), graph.Y(this.tgraph.yi), graph.screenWidth(this.tgraph.width), graph.screenHeight(-1 * this.tgraph.height), 'lightGray');

            }

            this.tgraph.rescale();
            graph.rescale();
            if (!graph.inFrame(this.tgraph.xi, this.tgraph.yi, this.tgraph.width, this.tgraph.height)) {
                return;
            }
            if ((screencell) > 5 && graph.canvas) {
                let x_world_start = graph.Xwc(0);
                let x_world_end = graph.Xwc(graph.canvas.width);
                let tx_world_start = this.tgraph.Xwc(x_world_start - this.tgraph.xi * 2);
                let tx_world_end = this.tgraph.Xwc(x_world_end - this.tgraph.xi * 2);
                if (this.query) {
                    for (let index = Math.floor(tx_world_start); index < Math.floor(tx_world_end); index++) {
                        let seq_index = index - Math.floor(this.xi);
                        if (seq_index < this.query.length && this.query[seq_index]) {
                            graph.drawString(this.query[seq_index], this.tgraph.X(index), this.tgraph.Y(0), 'black', this.ffont);
                        } else
                            graph.drawString('-', this.tgraph.X(index), this.tgraph.Y(0), 'gray');
                    }
                }
            }

            graph.drawString(this.name, this.tgraph.xi + this.tgraph.width, this.tgraph.Y(this.tgraph.ymax - (this.tgraph.ymax - this.tgraph.ymin) / 2), 'blue');

            let ymax = Math.round(this.tgraph.Ywc(graph.Ywc(0)));
            let ymin = Math.round(this.tgraph.Ywc(graph.Ywc(graph.canvas.height)));

            let index = 1;

            if (this.matches.length < 1) {

                for (let m of this.matches) {
                    m.draw(this.tgraph.ymax - index++, this.tgraph, graph);
                }
            } else {
                let diff = (ymax - ymin) * 2;
                for (let j = ymax - diff; j > ymin - diff && j >= 0; j--) {
                    if (j < this.matches.length) {
                        let match = this.matches[j]
                        if (match) {
                            match.draw(this.expression_options, j, this.tgraph, graph);
                            let t = this.tgraph.X(15)
                            graph.drawString(j + '', t, this.tgraph.Y(j), 'lightGray')
                        }
                    }
                    index++;
                }
            }
            if (this.scroll && graph) {
                await this.scroll.draw(graph)
            }
        }
    }
    resolve(AlignTrack);
})
