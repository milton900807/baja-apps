return new Promise(async (resolve, reject) => {
    let TrackLayer = await exec('baja/bio/track-layer.js');

    let AttributionLayer = class extends TrackLayer {
        acolor = "rgba(255, 252, 3, 0.2)";
        tcolor = "rgba(252, 123, 3, 0.3)";
        ccolor = "rgba(233, 3, 252, 0.3)";
        gcolor = "rgba(0, 0, 0, 0.4)";
        solid_color = "rgba(0, 0, 0, 0.1)";
        attribution_site = null;
        window = null;
        notCalculated = true;
        compounds = []
        showScore = false;   // score label hidden by default
        attribution_type;
        _odds_ratio_transient_ = null;
        max_y_transient_ = Math.random() * 2.0;

        constructor(name, xmin, ymin, xmax, ymax, attribution_type, attribution_site, window, track) {
            super(name, xmin, ymin, xmax, ymax);
            this.attribution_type = attribution_type;
            this.attribution_site = attribution_site;
            console.log('debubg');
            this.window = window;
            this.type = 'AttributionLayer'
            const sets = AttributionLayer.generateColorSets();
            if (attribution_type && attribution_type.indexOf('acceptor_attribution') >= 0) {
                this.acolor = `rgb(155, 5, 250, 0.5)`;
                this.tcolor = `rgb(173, 216, 230. 0.6)`;
                this.ccolor = `rgb(90, 100, 0, 0.4)`;
                this.gcolor = `rgb(25, 25, 112, 0.4)`;
            } else {
                this.acolor = 'rgb(255, 215, 0, 0.6)'
                this.tcolor = `rgb(0, 105, 148,0.4)`;
                this.ccolor = `rgb(124, 252, 0, 0.4)`
                this.gcolor = `rgb(255, 140, 0, 0.6)`;

            }

        }

        static calculateMedianLog2Values(log2Values) {
            if (log2Values.length === 0) {
                return null;
            }

            log2Values.sort((a, b) => a - b);

            const midIndex = Math.floor(log2Values.length / 2);

            if (log2Values.length % 2 !== 0) {

                return log2Values[midIndex];
            } else {

                return (log2Values[midIndex - 1] + log2Values[midIndex]) / 2;
            }
        }

        static calculateProbabilities(log2OddsRatios) {
            return log2OddsRatios.map(log2Odds => {
                const oddsRatio = Math.pow(2, log2Odds);
                const probability = oddsRatio / (1 + oddsRatio);
                return probability;
            });
        }

        static generateColorSets() {
            const baseColors = [
                { r: 255, g: 23, b: 0 },
                { r: 55, g: 255, b: 0 },
                { r: 0, g: 233, b: 255 },
                { r: 255, g: 255, b: 0 }
            ];

            const sets = baseColors.map(baseColor => {
                const colorSet = [];
                for (let i = 0; i < 4; i++) {
                    const alpha = (0.25 * (i + 1)).toFixed(2);
                    const color = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${alpha})`;
                    colorSet.push(color);
                }
                return colorSet;
            });

            return sets;
        }

        setColor(color) {
            this.acolor = color;
            this.tcolor = color;
            this.ccolor = color;
            this.gcolor = color;
            this.solid_color = color;
        }

        addAttributionPoint(x, y, base) {
            if (!x || !y) {
                console.log(" warning ")
                return;
            }
            if (base.toUpperCase() == 'A') {
                this.apts.push({ x: x, y: y })
            } else if (base.toUpperCase() == 'T') {
                this.tpts.push({ x: x, y: y })
            } else if (base.toUpperCase() == 'C') {
                this.cpts.push({ x: x, y: y })
            } else if (base.toUpperCase() == 'G') {
                this.gpts.push({ x: x, y: y })
            } else {
                console.log(x, y, base.toUpperCase(), base.upper)
            }
        }

        getScore(xin) {

            let pts = this.pts;
            if (!pts || pts.length === 0 || (pts[0] == null)) {
                pts = [].concat(this.apts, this.tpts, this.cpts, this.gpts)
            }
            let maxy = pts.reduce((max, obj) => {
                if (!obj) {
                    return { y: 0 };
                }
                if (typeof obj.y === 'number' && (max === undefined || obj.y > max)) {
                    return obj.y;
                }
                return max;
            });

            if (pts.length == 0) {
                console.log(" no pts in layer")
                return { y: 0 };
            }

            let max = pts.reduce((max, obj) => {
                if (!obj) {
                    console.log(" no object val ")
                    return { y: 0 };
                }
                if (typeof obj.x === 'number' && (max === undefined || obj.x > max)) {
                    return obj.x;
                }
                return max;
            });

            let min = pts.reduce((min, obj) => {
                if (!obj) {
                    return 0;
                }

                if (typeof obj.x === 'number' && (max === undefined || obj.x < min)) {
                    return obj.x;
                }
                return min;
            });
            let nearestPoint = pts[0];
            let minDistance = Math.abs(pts[0].x - xin);
            for (let i = 1; i < pts.length; i++) {
                let distance = Math.abs(pts[i].x - xin);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestPoint = pts[i];
                }
            }

            if (this.pts) {
                this.pts = pts;
            }

            return nearestPoint;
        }

        calculateVariance(log2OddsRatios) {
            const n = log2OddsRatios.length;
            if (n === 0) return 0;

            const mean = log2OddsRatios.reduce((acc, val) => acc + val, 0) / n;

            const sumOfSquared = log2OddsRatios.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);

            return sumOfSquared / (n - 1);
        }

        metaAnalysis(pts, track) {

            if (pts && pts.length > 0 && pts.map ) {

                let pr = pts.map(b => b.y)
                let variance = this.calculateVariance(pr);
                let weights = []
                let exons = track.getExons();
                for (let i = 0; i < pts.length; i++) {
                    let isExonic = false;
                    let exonLength = 1;
                    for (let e of exons) {
                        if (e.xi < pts[i].x && e.xf > pts[i].x) {
                            isExonic = true;
                            exonLength = e.xf - e.xi;
                        }
                    }
                    let weight = 1 / variance;
                    if (isExonic) {
                        weight = 1;
                    }
                    weights.push(weight)
                }
                let log2OddsRatios = pr;
                if (log2OddsRatios.length !== weights.length) {
                    console.error("Number of log2 odds ratios and weights should match.");
                    return null;
                }
                const weightedSum = log2OddsRatios.reduce((acc, logOR, i) => acc + logOR * weights[i], 0);
                const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
                const summaryLog2OR = weightedSum / totalWeight;

                return summaryLog2OR;
            }
        }
        simplify(points, tolerance) {
            if (points.length < 3) return points;
            let maxDistance = 0;
            let index = 0;
            for (let i = 1; i < points.length - 1; i++) {
                let distance = this.perpendicularDistance(points[i], points[0], points[points.length - 1]);
                if (distance > maxDistance) {
                    index = i;
                    maxDistance = distance;
                }
            }
            if (maxDistance > tolerance) {
                let left = this.simplify(points.slice(0, index + 1), tolerance);
                let right = this.simplify(points.slice(index), tolerance);

                return left.slice(0, left.length - 1).concat(right);
            } else {
                return [points[0], points[points.length - 1]];
            }
        }

        async draw(tgraph, graph, track) {
            if (!this.visible) {
                return;
            }

            let total = 0;
            try {
                let pts = this.pts;
                if (!pts || pts.length === 0) {
                    pts = [].concat(this.apts, this.tpts, this.cpts, this.gpts)
                    if (pts.length > 20000) {
                        pts = this.simplify(pts, 0.3)
                    }
                }

                if (pts.length === 0) {
                    return;
                }

                if (track) {
                    if ((graph.flexigraphMouseMoveListeners && !this.isIn(graph.flexigraphMouseMoveListeners, this.mouseMoveListener))) {
                        this.mouseMoveListener = (xs, ys) => {
                            if (!this.interactive) {
                                return;
                            }
                            this.highlight = false;
                            if (graph) {
                                tgraph.rescale();
                                let xt = this.tgraph.X(this.attribution_site)
                                let distx = Math.abs(xt - xs);
                                if (distx <= 15) {
                                    this.highlight = true;
                                }
                            }
                        }
                        graph.flexigraphMouseMoveListeners.push(this.mouseMoveListener)
                    }
                    if ((graph.flexigraphMouseDownListeners && !this.isIn(graph.flexigraphMouseDownListeners, this.mouseDownListener))) {
                        this.mouseDownListener = (xs, ys) => {
                            if (!this.interactive) {
                                return;
                            }

                            if (this.highlight) {
                                let m = {
                                    label: 'Hide other layers',
                                    click: async (xwc, ywc) => {
                                    },
                                    move: () => {
                                        log('')
                                    }
                                }
                                graph.setMessage(' - -- - - - - - - - -')
                                graph.showMenu(m, xs + 5, ys)
                            }

                        }
                        graph.flexigraphMouseDownListeners.push(this.mouseDownListener)
                    }
                }

                let prob = this.metaAnalysis(pts, track);
                this._odds_ratio_transient_ = (prob * 100).toFixed(4) + '    --> No pts : ' + pts.length;

                let canvas = graph.canvas;
                let ctx = canvas.getCTX();
                this.tgraph.rescale();
                let screencell = graph.screenWidth(1)

                if (this.attribution_site != null && this.window != null) {

                    ctx.fillStyle = 'rgba(255,10,10,0.5)';
                    ctx.fillRect(this.tgraph.X(this.attribution_site), this.tgraph.Y(0), 1, this.tgraph.screenHeight(-1))

                }
                try {

                    if (this.highlight) {
                        ctx.shadowColor = 'yellow'
                        ctx.shadowBlur = 2;
                    } else {
                        ctx.shadowColor = 'black'
                        ctx.shadowBlur = 0;
                    }

                    if (screencell > 5) {

                        if (this.highlight) {

                            ctx.fillStyle = 'yellow'
                            for (let pt of this.apts) {
                                ctx.fillRect(this.tgraph.X(pt.x), this.tgraph.Y(0), 13, this.tgraph.screenHeight(pt.y))
                                total += pt.y
                            }
                            for (let pt of this.tpts) {
                                ctx.fillRect(this.tgraph.X(pt.x), this.tgraph.Y(0), 13, this.tgraph.screenHeight(pt.y))
                                total += pt.y
                            }
                            for (let pt of this.cpts) {
                                ctx.fillRect(this.tgraph.X(pt.x), this.tgraph.Y(0), 13, this.tgraph.screenHeight(pt.y))
                                total += pt.y
                            }
                            for (let pt of this.gpts) {
                                ctx.fillRect(this.tgraph.X(pt.x), this.tgraph.Y(0), 13, this.tgraph.screenHeight(pt.y))
                                total += pt.y
                            }
                        } else {

                            ctx.fillStyle = this.acolor
                            for (let pt of this.apts) {
                                ctx.fillRect(this.tgraph.X(pt.x), this.tgraph.Y(0), 13, this.tgraph.screenHeight(pt.y))
                                total += pt.y
                            }
                            ctx.fillStyle = this.tcolor
                            for (let pt of this.tpts) {
                                ctx.fillRect(this.tgraph.X(pt.x), this.tgraph.Y(0), 13, this.tgraph.screenHeight(pt.y))
                                total += pt.y
                            }
                            ctx.fillStyle = this.ccolor
                            for (let pt of this.cpts) {
                                ctx.fillRect(this.tgraph.X(pt.x), this.tgraph.Y(0), 13, this.tgraph.screenHeight(pt.y))
                                total += pt.y
                            }
                            ctx.fillStyle = this.gcolor
                            for (let pt of this.gpts) {
                                ctx.fillRect(this.tgraph.X(pt.x), this.tgraph.Y(0), 13, this.tgraph.screenHeight(pt.y))
                                total += pt.y
                            }

                        }

                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = 'black';
                        ctx.font = 'plain 12px serif';
                        if (this.attribution_type && this.attribution_type.indexOf('acceptor_attribution') >= 0) {
                            for (let c of this.compounds) {

                            }
                        }
                        else {
                            for (let c of this.compounds) {

                            }
                        }

                    }
                    else
                        if (screencell > 1) {
                            ctx.fillStyle = this.acolor;
                            for (let pt of this.apts) {
                                ctx.fillRect(this.tgraph.X(pt.x), this.tgraph.Y(0), 7, this.tgraph.screenHeight(pt.y))
                                total += pt.y
                            }
                            ctx.fillStyle = this.tcolor;
                            for (let pt of this.tpts) {
                                ctx.fillRect(this.tgraph.X(pt.x), this.tgraph.Y(0), 7, this.tgraph.screenHeight(pt.y))
                                total += pt.y
                            }
                            ctx.fillStyle = this.ccolor;
                            for (let pt of this.cpts) {
                                ctx.fillRect(this.tgraph.X(pt.x), this.tgraph.Y(0), 7, this.tgraph.screenHeight(pt.y))
                                total += pt.y

                            }
                            ctx.fillStyle = this.gcolor;
                            for (let pt of this.gpts) {
                                ctx.fillRect(this.tgraph.X(pt.x), this.tgraph.Y(0), 7, this.tgraph.screenHeight(pt.y))

                                total += pt.y

                            }
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = 'black';
                            ctx.font = 'bold 10px serif';
                            if (this.attribution_type && this.attribution_type.indexOf('acceptor_attribution') >= 0) {
                                for (let c of this.compounds) {

                                }
                            }
                            else {
                                for (let c of this.compounds) {

                                }
                            }

                        }

                        else {
                            ctx.fillStyle = this.solid_color;
                            total = 0;
                            for (let pt of pts) {
                                ctx.fillRect(this.tgraph.X(pt.x), this.tgraph.Y(0), 3, this.tgraph.screenHeight(pt.y))
                                total += pt.y;

                            }
                        }

                    if (screencell > 1) {

                        ctx.fillStyle = 'gray';
                        let my = (this.tgraph.ymax - this.tgraph.ymin) / 2;

                        ctx.font = 'bold 13px serif';
                        ctx.shadowColor = 'black'
                        ctx.shadowBlur = 0;
                        if (this.showScore && this.max_y_transient_)
                            ctx.fillText('(' + prob.toFixed(5) + ') ' + this.name, this.tgraph.X((this.attribution_site)), this.tgraph.Y(this.max_y_transient_));

                        ctx.shadowColor = 'black'
                        ctx.shadowBlur = 0;
                    }

                } catch (exception) {
                    console.log(' ex ' + exception)
                    this.reloadSVGs();
                    ctx.shadowColor = 'black'
                    ctx.shadowBlur = 0;

                }
            } catch (exc) {

                console.log(exc)

            }
        }
    }
    resolve(AttributionLayer);
});
