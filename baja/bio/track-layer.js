return new Promise(async (resolve, reject) => {
    let MGrid = await exec('flexigraph/grid.js')

    const MAX_DRAW_POINTS = 2000;
    const simplifyTo = (pts, maxPts) => {
        if (pts.length <= maxPts) return pts;
        const step = Math.ceil(pts.length / maxPts);
        const out = [];
        for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
        if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
        return out;
    };

    function probToColor(p) {
        const hue = Math.max(0, Math.min(120, Math.round(p * 120)));
        return `hsl(${hue}, 95%, 45%)`;
    }

    function drawProbCodingMetrics(graph, tgraph, data, opts = {}) {
        const result = Array.isArray(data.results) ? data.results[0] : data;
        const L = result.length_nt || (result.sequence && result.sequence.length_nt) || 0;
        const orfs = result.orfs || [];

        const colorMap = new Array(L);
        for (const orf of orfs) {
            const p = (orf.pred && orf.pred.prob_coding) || 0;
            const col = probToColor(p);
            const s = Math.max(0, Math.floor(orf.start));
            const e = Math.min(L, Math.floor(orf.end));
            for (let i = s; i < e; i++) colorMap[i] = col;
        }

        const ws = opts.worldStart ?? 0;
        const we = opts.worldEnd ?? L;
        const seqStart = opts.seqStart ?? 0;
        const seqEnd = opts.seqEnd ?? L;
        const xi = opts.xi ?? 0;
        const yFrac = opts.yFrac ?? 0.08;
        const linePx = opts.linePx ?? 4;

        if (typeof drawUnderlineRuns === "function") {
            drawUnderlineRuns(graph, tgraph, ws, we, seqStart, seqEnd, xi, colorMap, yFrac, linePx);
        } else {

            const ctx = graph.ctx;
            ctx.save();
            for (const orf of orfs) {
                const p = (orf.pred && orf.pred.prob_coding) || 0;
                const col = probToColor(p);
                const xs = Math.max(ws, orf.start), xe = Math.min(we, orf.end);
                if (xe <= xs) continue;
                const y = tgraph.Y(yFrac);
                ctx.strokeStyle = col;
                ctx.lineWidth = linePx;
                ctx.beginPath();
                ctx.moveTo(tgraph.X(xs), y);
                ctx.lineTo(tgraph.X(xe), y);
                ctx.stroke();
            }
            ctx.restore();
        }

        if (opts.labels !== false) {
            const ctx = graph.ctx;
            ctx.save();
            ctx.font = opts.font ?? "10px monospace";
            ctx.fillStyle = opts.textColor ?? "#222";
            ctx.textBaseline = "bottom";
            const labelY = tgraph.Y(opts.labelYFrac ?? (yFrac - 0.01));
            for (const orf of orfs) {
                const p = (orf.pred && orf.pred.prob_coding) || 0;
                const mid = 0.5 * (orf.start + orf.end);
                if (mid < ws || mid > we) continue;
                const text = opts.asPercent === false ? p.toFixed(3) : (p * 100).toFixed(1) + "%";
                const x = tgraph.X(mid);
                const w = ctx.measureText(text).width;
                const xClamped = Math.max(tgraph.X(ws) + w / 2, Math.min(x, tgraph.X(we) - w / 2));
                ctx.fillText(text, xClamped, labelY);
            }
            ctx.restore();
        }
    }

    function clipPolylineX(pts, xmin, xmax) {
        if (!pts || pts.length === 0) return [];

        const out = [];
        const n = pts.length;

        const inside = (wx1) => wx1 >= xmin && wx1 <= xmax;
        for (let i = 0; i < n - 1; i++) {
            const a = pts[i], b = pts[i + 1];

            const axp1 = a.x + 1, bxp1 = b.x + 1;
            const ay = a.y, by = b.y;

            const aIn = inside(axp1);
            const bIn = inside(bxp1);

            const addIntersect = (xc) => {
                const dx = (bxp1 - axp1);
                if (dx === 0) return;
                const t = (xc - axp1) / dx;
                const y = ay + t * (by - ay);

                out.push({ x: xc - 1, y });
            };

            if (aIn && bIn) {

                out.push({ x: a.x, y: a.y });

            } else if (aIn && !bIn) {

                out.push({ x: a.x, y: a.y });
                if (bxp1 < xmin) addIntersect(xmin);
                else if (bxp1 > xmax) addIntersect(xmax);
            } else if (!aIn && bIn) {

                if (axp1 < xmin) addIntersect(xmin);
                else if (axp1 > xmax) addIntersect(xmax);

            } else {

                const minx = Math.min(axp1, bxp1), maxx = Math.max(axp1, bxp1);
                if (minx <= xmin && maxx >= xmax) {

                    const firstX = (axp1 < bxp1) ? xmin : xmax;
                    const secondX = (axp1 < bxp1) ? xmax : xmin;
                    addIntersect(firstX);
                    addIntersect(secondX);
                } else if (minx <= xmin && maxx >= xmin) {
                    addIntersect(xmin);
                } else if (minx <= xmax && maxx >= xmax) {
                    addIntersect(xmax);
                }

            }
        }

        const last = pts[pts.length - 1];
        const lastXp1 = last.x + 1;
        if (lastXp1 >= xmin && lastXp1 <= xmax) {
            out.push({ x: last.x, y: last.y });
        }

        if (out.length > 1) {
            const dedup = [out[0]];
            for (let i = 1; i < out.length; i++) {
                const p = out[i], q = dedup[dedup.length - 1];
                if (p.x !== q.x || p.y !== q.y) dedup.push(p);
            }
            return dedup;
        }
        return out;
    }

    let TrackLayer = class TrackLayer {
        name = 'untitled';
        tgraph;
        tpts = [];
        cpts = [];
        gpts = [];
        apts = [];
        npts_transient_ = [];

        data_type = 'undefined';
        pts = [];
        intervals = [];
        polygonpts = [];
        polygon_type = 'fill'
        scaley = -3.;
        svgs = [];
        annotations = [];
        track_layer_imgs = [];
        visible = true;
        color = "rgba(10,104,0,0.37)";
        fillstyle = "rgba(0,204,0,0.35)";
        type = 'TrackLayer'
        dps = [];
        highlight_text = []
        mouseMoveListener;
        mouseDownListener;
        mouseUpListener;
        highlight_point;
        lastedit = null;
        highlight = false;
        interactive = false;
        show_background = false;
        defaultFont = "10px Arial";
        uid = uuid();
        drawStyle = 'default'
        polynomialFunction = null;

        defaultColor = 'rgba(100, 100, 200, 1)'

        constructor(name, xmin, ymin, xmax, ymax) {
            this.name = '' + sanitizeName(name);
            this.tgraph = new MGrid(0, 0, 100, 100);
            this.tgraph.xi = 0;
            this.tgraph.yi = 0;
            this.tgraph.setxmax(xmax);
            this.tgraph.setymax(ymax);
            this.tgraph.setxmin(xmin);
            this.tgraph.setymin(ymin);
            this.tgraph.setInset(0, 0)
            this.tgraph.rescale();
            this.lastedit = new Date().getTime();

            this.color = this.getRandomColor();
            this.fillstyle = this.getRandomColor();

            if (this.name && this.name.startsWith('/')) {
                let lastIndex = this.name.lastIndexOf('/')
                if (lastIndex >= 0)
                    this.name = this.name.substring(lastIndex + 1)
            }

        }

        getRandomColor() {
            // Darker, more saturated random hue (0-170) at a higher alpha, so coverage
            // layers (RNASeq, etc.) actually read against the track instead of being
            // near-invisible (was 0-255 @ 0.06) — still relatively transparent.
            const r = Math.floor(Math.random() * 170);
            const g = Math.floor(Math.random() * 170);
            const b = Math.floor(Math.random() * 170);
            const a = 0.32

            return `rgba(${r},${g},${b},${a})`;
        }

        setColor(color) {
            this.color = color;
            this.color = rgbToRgba(color, 0.1)
            this.fillstyle = color;
        }
        setLabelFont(font) {
            this.defaultFont = font;
        }

        setTimedHighlight(timems) {
            this.highlight = true;
            if (timems) {
                setTimeout(() => {
                    this.highlight = false;
                }, timems)
            }
        }

        lagrangeInterpolation(points) {
            return function (x) {
                let result = 0;
                if (points && points != null) {
                    const n = points.length;
                    for (let i = 0; i < n; i++) {
                        let term = points[i].y;
                        for (let j = 0; j < n; j++) {
                            if (i !== j) {
                                term *= (x - points[j].x) / (points[i].x - points[j].x);
                            }
                        }
                        result += term;
                    }
                }
                return result;
            };
        }

        copyWithinRange(xi, xf) {
            let cpt = new TrackLayer(sanitizeName(this.name), this.tgraph.xmin, this.tgraph.ymin, this.tgraph.xmax, this.tgraph.ymax);
            cpt.pts = this.pts.filter(pt => pt.x >= xi && pt.x <= xf);
            cpt.intervals = this.intervals.filter(interval => interval.x1 >= xi && interval.x2 <= xf);
            cpt.polygonpts = this.polygonpts.filter(pt => pt.x >= xi && pt.x <= xf);
            cpt.annotations = this.annotations;
            cpt.reloadSVGs();
            cpt.tgraph.setxmin(xi);
            cpt.tgraph.setxmax(xf);
            cpt.tgraph.setWidth(this.tgraph.X(xf) - this.tgraph.X(xi))
            cpt.tgraph.xi = this.tgraph.X(xi)
            cpt.tgraph.rescale();
            return cpt;
        }

        async addSVG(svgObject) {
            var s = new XMLSerializer();
            var str = s.serializeToString(svgObject);
            var svg64 = btoa(str);
            var b64Start = 'data:image/svg+xml;base64,';
            var image64 = b64Start + svg64;
            let img = new Image();
            img.src = image64;
            this.svgs.push(image64);
            img.onload = () => {
                this.track_layer_imgs.push(img)
            }
            this.lastedit = new Date().getTime();

        }

        release() {
            this.mouseDownListener = null;
            this.mouseMoveListener = null;
            this.mouseUpListener = null;
            this.interactive = false;
        }

        addAnnotation(a) {
            this.annotations.push(a);
            this.lastedit = new Date().getTime();

        }

        reloadSVGs() {
            for (let s of this.svgs) {
                let i = new Image();
                i.src = s;
                i.onload = () => {
                    this.track_layer_imgs.push(i)
                }

            }
        }

        getXi() {
            return this.tgraph.xi;
        }
        getYi() {
            return this.tgraph.yi;
        }

        getWidth() {
            return this.tgraph.width;
        }

        getHeight() {
            return this.tgraph.height;
        }

        setxmax(xmax) {
            this.tgraph.xmax = xmax;
        }
        setymax(ymax) {
            this.tgraph.ymax = ymax;
        }
        setxmin(xmin) {
            this.tgraph.xmin = xmin;
        }
        setymin(ymin) {
            this.tgraph.ymin = ymin;
        }

        setXi(xi) {
            this.tgraph.xi = xi;
        }
        setYi(yi) {
            this.tgraph.yi = yi;
        }
        setWidth(width) {
            this.tgraph.width = width;
        }
        setHeight(height) {
            this.tgraph.height = Math.abs(height);
        }
        addPoint(x, y) {
            this.pts.push({ x: x, y: y })
            this.lastedit = new Date().getTime();

        }

        addInterval(x1, x2, y, t, color) {
            const alreadyExists = this.intervals.some(interval => interval.x1 === x1 && interval.x2 === x2)
            if (!alreadyExists) {

                // The two branches used to be inverted: a caller that PASSED a colour got an
                // interval stored without one, and the renderer below (`else if (int.color)`)
                // then fell back to the layer colour, so per-interval colours were silently
                // dropped. Callers that pass no colour behave exactly as before.
                if (color) {
                    this.intervals.push({ x1: x1, x2: x2, y: y, t: t, color: color });
                } else {
                    this.intervals.push({ x1: x1, x2: x2, y: y, t: t });
                }
                this.lastedit = new Date().getTime();

            }
        }

        setIntervalColor(x1, x2, y, t, color) {

            const intX1 = Math.round(x1);
            const intX2 = Math.round(x2);
            const intY = Math.round(y);

            const intervalIndex = this.intervals.findIndex(interval =>
                interval.x1 === intX1 &&
                interval.x2 === intX2
            );

            if (intervalIndex === -1) {
                const newInterval = { x1: intX1, x2: intX2, y: intY, t: t };

                if (color) {
                    newInterval.color = color;
                }

                this.intervals.push(newInterval);
                this.lastedit = new Date().getTime();
            } else {

                const existingInterval = this.intervals[intervalIndex];
                if (color) {
                    existingInterval.color = color;
                }
                this.lastedit = new Date().getTime();
            }

        }

        addPolygonPoint(x, y) {
            this.polygonpts.push({ x: x, y: y })
            this.lastedit = new Date().getTime();

        }
        sortPolygonPoints() {
            this.polygonpts = this.polygonpts.sort((a, b) => a.x - b.x)
        }

        highlightText(t) {
            this.highlight_text.push(t);
        }

        simplify(points, tolerance) {
            if (!points) return points;
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

        douglasPeucker(points, epsilon) {
            if (!points || points.length <= 2) {
                return points;
            }

            const xValues = points.map(point => point[0]);
            const uniqueXValues = new Set(xValues).size;

            const adjustedEpsilon = epsilon / uniqueXValues;

            let dMax = 0;
            let index = 0;
            const end = points.length - 1;
            for (let i = 1; i < end; i++) {
                const d = this.perpendicularDistance(points[i], points[0], points[end]);
                if (d > dMax) {
                    index = i;
                    dMax = d;
                }
            }

            if (dMax > adjustedEpsilon) {
                const recursive1 = this.douglasPeucker(points.slice(0, index + 1), epsilon);
                const recursive2 = this.douglasPeucker(points.slice(index), epsilon);
                return recursive1.slice(0, -1).concat(recursive2);
            } else {
                return [points[0], points[end]];
            }
        }

        perpendicularDistance(point, lineStart, lineEnd) {
            const x0 = point[0];
            const y0 = point[1];
            const x1 = lineStart[0];
            const y1 = lineStart[1];
            const x2 = lineEnd[0];
            const y2 = lineEnd[1];

            const numerator = Math.abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1);
            const denominator = Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2));

            return numerator / denominator;
        }

        perpendicularDistance(point, lineStart, lineEnd) {
            if (lineStart.x === lineEnd.x && lineStart.y === lineEnd.y) {
                return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
            }

            const norm = Math.hypot(lineEnd.x - lineStart.x, lineEnd.y - lineStart.y);
            const u = ((point.x - lineStart.x) * (lineEnd.x - lineStart.x) + (point.y - lineStart.y) * (lineEnd.y - lineStart.y)) / (norm * norm);

            if (u < 0.0 || u > 1.0) {
                const d1 = Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
                const d2 = Math.hypot(point.x - lineEnd.x, point.y - lineEnd.y);
                return Math.min(d1, d2);
            }

            const intersection = { x: lineStart.x + u * (lineEnd.x - lineStart.x), y: lineStart.y + u * (lineEnd.y - lineStart.y) };
            return Math.hypot(point.x - intersection.x, point.y - intersection.y);
        }
        getYByOverlapCount(x1, x2) {
            const minY = 0.05;       // as close to ymin as possible
            const laneStep = 0.08;   // vertical spacing between rows
            const padX = 220;        // horizontal label footprint / padding

            // bounded search: at worst, one more lane than existing intervals
            const maxLanes = this.intervals.length + 1;

            for (let lane = 0; lane < maxLanes; lane++) {
                const candidateY = minY + (lane * laneStep);
                let overlaps = false;

                for (let obj of this.intervals) {
                    const xOverlap = Math.max(obj.x1 - padX, x1) <= Math.min(obj.x2 + padX, x2);
                    const sameLane = Math.abs((obj.y ?? minY) - candidateY) < (laneStep * 0.9);

                    if (xOverlap && sameLane) {
                        overlaps = true;
                        break;
                    }
                }

                // first non-overlapping lane is the closest possible to ymin
                if (!overlaps) {
                    return candidateY;
                }
            }

            // fallback, should rarely happen
            return minY + (maxLanes * laneStep);
        }

        gitVisibleTrackRange(__graph) {
            let graph = __graph;
            let gwcxs = graph.Xwc(0);
            if (!gwcxs)
                return -1;

            let gwcxf = graph.Xwc(0 + graph.grid.width);
            if (!gwcxf)
                return -1;
            let twcxs = this.tgraph.Xwc(gwcxs - 2 * this.tgraph.xi);
            let twcxf = this.tgraph.Xwc(gwcxf - 2 * this.tgraph.xi);
            let startIndex = Math.floor(twcxs);
            let endIndex = Math.floor(twcxf);
            return {
                start: startIndex,
                end: endIndex
            }
        }

        setDefaultColor(color) {
            this.defaultColor = color;
        }

        scaleValue(value) {
            let fromRange = [50000, 3000000];
            let toRange = [1, 1300];
            const [fromMin, fromMax] = fromRange;
            const [toMin, toMax] = toRange;
            const scaledValue = ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin) + toMin;
            return Math.max(toMin, Math.min(toMax, Math.round(scaledValue)));
        }

        distanceX(point1, point2) {
            return Math.abs(point1.x - point2.x);
        }

        findPointsWithEqualXDistance(graph, startPoint1, startPoint2, maxDistanceX) {
            const result = [];
            for (const point of graph) {
                const dist1 = distanceX(point, startPoint1);
                const dist2 = distanceX(point, startPoint2);
                if (Math.abs(dist1 - dist2) <= maxDistanceX) {
                    result.push(point);
                }
            }
            return result;
        }

        isIn(arr, target) {
            for (let item of arr) {
                if (item === target) {
                    return true;
                }
            }
            return false;
        }

        clearPolygonPoints() {
            this.polygonpts = [];
            this.lastedit = new Date().getTime();

        }

        wrapText(context, text, maxWidth) {
            // Honor EXPLICIT line breaks ('\n') first — e.g. a multi-field metadata label — then
            // word-wrap each line to maxWidth. Plain strings (no '\n') behave exactly as before.
            let lines = [];
            const paragraphs = ('' + (text == null ? '' : text)).split('\n');
            for (const para of paragraphs) {
                const words = para.split(' ');
                if (!words.length) { lines.push(''); continue; }
                let currentLine = words[0];
                for (let i = 1; i < words.length; i++) {
                    const word = words[i];
                    const width = context.measureText(currentLine + " " + word).width;
                    if (width < maxWidth) {
                        currentLine += " " + word;
                    } else {
                        lines.push(currentLine);
                        currentLine = word;
                    }
                }
                lines.push(currentLine);
            }
            return lines;
        }

        // ---- Sashimi (splice-junction arc) rendering ------------------------
        // Driven entirely by serializable fields: arc_type === 'SpliceSashimi'
        // and junctions = [{ d, a, dp, ap, mag, kind }] in track-local coords.
        // Directionality: donor->acceptor color gradient + arrowhead at acceptor.
        // Magnitude: arc thickness/crest + per-side strength bars. kind === 'skip'
        // draws dashed (exon-skipping junctions).
        _sashimiArrowHead(ctx, tx, ty, dx, dy, size, color) {
            let len = Math.hypot(dx, dy) || 1;
            let ux = dx / len, uy = dy / len, px = -uy, py = ux;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx - ux * size + px * size * 0.6, ty - uy * size + py * size * 0.6);
            ctx.lineTo(tx - ux * size - px * size * 0.6, ty - uy * size - py * size * 0.6);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
        }

        _sashimiBar(ctx, x, baselineY, prob, color, maxBarPx) {
            let h = maxBarPx * Math.max(0, Math.min(1, prob || 0));
            if (h < 1) return;
            ctx.fillStyle = color;
            ctx.fillRect(x - 1.5, baselineY - h, 3, h);
        }

        drawSashimi(tgraph, graph, track) {
            if (!this.visible || !Array.isArray(this.junctions) || !this.junctions.length) return;
            let ctx = graph.canvas.getCTX();
            let donorColor = this.donorColor || 'rgba(26,163,189,0.95)';
            let acceptorColor = this.acceptorColor || 'rgba(224,112,59,0.95)';
            let labelColor = this.labelColor || 'rgba(70,70,70,0.95)';
            let maxBarPx = this.maxBarPx || 20;
            // Top of the magnitude scale (e.g. 2 for site strength, 1 for PSI);
            // arc weight / crest are normalized by this while the label shows the
            // real magnitude.
            let magMax = this.magMax || 1;

            let baselineY = graph.Y(tgraph.Y(0));
            let w = graph.width;

            for (let j of this.junctions) {
                if (!j) continue;
                let x1 = graph.X(tgraph.X(j.d));   // donor
                let x2 = graph.X(tgraph.X(j.a));   // acceptor
                if (Math.max(x1, x2) < 0 || Math.min(x1, x2) > w) continue;
                let chord = Math.abs(x2 - x1);
                if (chord < 1) continue;

                let dp = (typeof j.dp === 'number') ? j.dp : (j.s || 0);
                let ap = (typeof j.ap === 'number') ? j.ap : (j.s || 0);
                let s = (typeof j.mag === 'number') ? j.mag
                    : (typeof j.s === 'number') ? j.s : Math.min(dp, ap);
                let sn = Math.max(0, Math.min(1, s / magMax));   // normalized 0..1 for drawing
                let isSkip = (j.kind === 'skip');

                let sagitta = Math.max(12, chord / 5) * (0.6 + 0.8 * sn) * (isSkip ? 1.6 : 1.0);
                let radius = (sagitta / 2) + (chord * chord) / (8 * sagitta);
                let offset = Math.sqrt(Math.max(0, radius * radius - (chord / 2) * (chord / 2)));
                let midX = (x1 + x2) / 2;
                let centerX = midX;
                let centerY = baselineY + offset;
                let a1 = Math.atan2(baselineY - centerY, x1 - centerX);
                let a2 = Math.atan2(baselineY - centerY, x2 - centerX);

                let grad = ctx.createLinearGradient(x1, baselineY, x2, baselineY);
                grad.addColorStop(0, donorColor);
                grad.addColorStop(1, acceptorColor);
                ctx.beginPath();
                ctx.strokeStyle = grad;
                ctx.lineWidth = 0.75 + 3.75 * sn;
                if (isSkip) ctx.setLineDash([5, 4]); else ctx.setLineDash([]);
                ctx.arc(centerX, centerY, radius, a1, a2, false);
                ctx.stroke();
                ctx.setLineDash([]);

                this._sashimiBar(ctx, x1, baselineY, dp, donorColor, maxBarPx);
                this._sashimiBar(ctx, x2, baselineY, ap, acceptorColor, maxBarPx);

                let near = a2 + (a1 - a2) * 0.10;
                let nx = centerX + radius * Math.cos(near);
                let ny = centerY + radius * Math.sin(near);
                this._sashimiArrowHead(ctx, x2, baselineY, x2 - nx, baselineY - ny, 7, acceptorColor);
                this._sashimiArrowHead(ctx, x1, baselineY - maxBarPx * Math.min(1, dp), 0, -1, 4, donorColor);

                // Arc weight label at the crest — shown whenever the arc is wide
                // enough to fit the number (independent of base-level zoom). A white
                // halo keeps it legible over the arcs.
                const label = s.toFixed(2);
                // Skip trivial weights (0 or 1) — only show the interesting ones.
                if (chord > 22 && label !== '0.00' && label !== '1.00') {
                    let topY = centerY - radius;
                    ctx.font = 'bold 10px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                    ctx.lineJoin = 'round';
                    ctx.strokeText(label, midX, topY - 2);
                    ctx.fillStyle = labelColor;
                    ctx.fillText(label, midX, topY - 2);
                }
            }
            ctx.lineWidth = 1;
            ctx.textAlign = 'left';
        }

        async draw(parentTrack, graph, __track) {
            if (!this.visible) {
                return;
            }
            // Rehydrate a plain-object tgraph (e.g. from a JSON clone / reload) back into a
            // real MGrid so rescale()/X()/Y() work — otherwise draw crashes the whole track.
            if (!this.tgraph || typeof this.tgraph.rescale !== 'function') {
                this.tgraph = Object.assign(new MGrid(0, 0, 100, 100), this.tgraph || {});
            }
            if (!graph.inFrame(__track.tgraph.xi, __track.tgraph.yi, __track.tgraph.width, __track.tgraph.height)) {
                return;
            }
            // Sashimi layers carry their arcs as plain `junctions` data (so they
            // survive JSON save/reload as a base TrackLayer). Render them here.
            if (this.arc_type === 'SpliceSashimi' && Array.isArray(this.junctions) && this.junctions.length) {
                this.drawSashimi(parentTrack, graph, __track);
                return;
            }
            let canvas = graph.canvas;
            let ctx = canvas.getCTX();
            this.tgraph.rescale();
            if (this.svgs && this.svgs.length > 0 && this.track_layer_imgs.length === 0) {
                this.reloadSVGs();
            }
            let screencell = graph.screenWidth(parentTrack.screenWidth(1))
            try {
                for (let s of this.track_layer_imgs) {
                    ctx.drawImage(s, this.tgraph.xi, this.tgraph.yi, this.tgraph.width, this.tgraph.height);
                }

                if (this.annotations && this.annotations.length > 0) {
                    const groups = {};
                    let annot = this.annotations;
                    annot.forEach(annotation => {
                        if (!groups[annotation.name]) {
                            groups[annotation.name] = [];
                        }
                        groups[annotation.name].push(annotation.xi);
                    });
                    Object.keys(groups).forEach((name, index) => {
                        const xis = groups[name].sort((a, b) => a - b);
                        const color = this.color;
                        for (let i = 0; i < xis.length - 1; i++) {
                            const xCenter = ((this.tgraph.X(xis[i])) + (this.tgraph.X(xis[i + 1]))) / 2;
                            const yCenter = (this.tgraph.yi + this.tgraph.height);
                            const radius = ((this.tgraph.X(xis[i + 1])) - (this.tgraph.X(xis[i]))) / 2;

                            ctx.beginPath();
                            ctx.strokeStyle = color;
                            ctx.lineWidth = 1;
                            ctx.arc(xCenter, yCenter, radius, 0, Math.PI, true);
                            ctx.stroke();

                            const arcTopX = xCenter;
                            const arcTopY = yCenter - radius;

                            ctx.save();

                            ctx.translate(arcTopX, arcTopY);
                            ctx.rotate(45 * Math.PI / 180);

                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'bottom';
                            ctx.font = "10px Arial";
                            ctx.fillStyle = color;
                            ctx.fillText(name, 0, 0);

                            ctx.restore();
                        }
                    });
                    for (let a of this.annotations) {
                        a.draw(graph, __track);
                    }
                }
                ctx.fillStyle = this.fillstyle;
                ctx.lineWidth = 2;
                ctx.lineCap = 'butt';
                ctx.textBaseline = 'middle';
                ctx.font = "10px Arial";
                let n = 1;

                let startx = parentTrack.Xwc(graph.grid.Xwc(0) - 2 * parentTrack.xi)
                let stopx = parentTrack.Xwc(graph.grid.Xwc(graph.grid.width) - 2 * parentTrack.xi)

                if (this.polygonpts && this.polygonpts.length > 2) {

                    (() => {

                        const clipped = clipPolylineX(this.polygonpts, startx, stopx);
                        if (clipped.length < 2) return;

                        const screenPolyline = new Array(clipped.length);
                        for (let i = 0; i < clipped.length; i++) {
                            const p = clipped[i];

                            screenPolyline[i] = {
                                x: this.tgraph.X(p.x + 1),
                                y: this.tgraph.Y(p.y),
                            };
                        }

                        const simp = simplifyTo(screenPolyline, MAX_DRAW_POINTS);
                        if (simp.length < 2) return;

                        ctx.beginPath();
                        if (this.polygon_type === 'fill') {
                            const first = simp[0];
                            const last = simp[simp.length - 1];

                            const yBase = this.tgraph.Y(0);

                            ctx.moveTo(first.x, yBase);
                            ctx.lineTo(first.x, first.y);

                            for (let i = 1; i < simp.length; i++) {
                                ctx.lineTo(simp[i].x, simp[i].y);
                            }

                            ctx.lineTo(last.x, yBase);
                            ctx.closePath();
                            ctx.fill();
                        } else {
                            ctx.moveTo(simp[0].x, simp[0].y);
                            for (let i = 1; i < simp.length; i++) {
                                ctx.lineTo(simp[i].x, simp[i].y);
                            }
                            ctx.stroke();
                        }
                    })();
                }

                ctx.lineWidth = 4;
                ctx.lineCap = 'butt';
                ctx.textBaseline = 'middle';
                ctx.font = this.defaultFont;

                ctx.strokeStyle = "transparent";

                ctx.fillStyle = this.color;
                for (let int of this.intervals) {
                    ctx.beginPath();
                    ctx.moveTo((this.tgraph.X(int.x1)), (this.tgraph.Y(int.y)));
                    ctx.lineTo((this.tgraph.X(int.x2)), (this.tgraph.Y(int.y)));
                    const x = this.tgraph.X(int.x1);
                    const y = this.tgraph.Y(int.y);
                    const width = this.tgraph.screenWidth(int.x2 - int.x1);
                    const height = this.tgraph.screenHeight(int.y);
                    if (this.highlight) {
                        ctx.fillStyle = "magenta";
                        ctx.strokeStyle = "magenta";
                        ctx.lineWidth = 14;
                    } else if (int.color) {
                        ctx.fillStyle = int.color;
                        ctx.strokeStyle = int.color;

                    }
                    else {
                        ctx.fillStyle = this.color;
                        ctx.strokeStyle = this.color;
                    }

                    // When highlighted, keep a minimum on-screen width so narrow
                    // intervals stay visible even when the view is zoomed way out.
                    let drawWidth = width;
                    if (this.highlight && Math.abs(drawWidth) < 5) drawWidth = 5;
                    ctx.fillRect(x, y, drawWidth, height);

                    if (screencell > (this.labelZoomThreshold != null ? this.labelZoomThreshold : 0.4)) {
                        let text;
                        if (int.t) {
                            text = int.t;
                        } else {
                            text = this.name;
                        }
                        ctx.fillStyle = 'black';

                        ctx.fillStyle = 'black';
                        const maxWidth = 300;
                        const lineHeight = 15;
                        const lines = this.wrapText(ctx, text, maxWidth);
                        let screeny = this.tgraph.Y(int.y);
                        let screenx = this.tgraph.X(int.x2 + 1)
                        if (screenx > 0 || screenx < graph.grid.width - 100 || screeny > 0 || screeny < graph.grid.height - 100) {

                            lines.forEach((line) => {
                                ctx.fillText(line, screenx, screeny);
                                screeny += 15;
                            });
                            ctx.fillStyle = this.defaultColor;

                        }
                        ctx.stroke();
                    }
                }

                if (this.highlight_text.length > 0) {
                    for (let ht of this.highlight_text) {
                        const lowerSearchString = ht.toLowerCase().trim();
                        const foundSubstrings = this.intervals.reduce((matches, item) => {
                            const lowerItem = ('' + (item && item.t || '')).toLowerCase();
                            if (lowerItem.includes(lowerSearchString.trim())) {
                                matches.push(item);
                            }
                            return matches;
                        }, []);
                        if (foundSubstrings != null && foundSubstrings.length > 0) {
                            ctx.font = "10px Arial";
                            ctx.strokeStyle = "rgba(200,0,0,1)";
                            ctx.fillStyle = "rgba(200,0,0,1)";

                            for (let f of foundSubstrings) {
                                ctx.fillText(f.t, (this.tgraph.X(f.x2 + 1)), (this.tgraph.Y(f.y)));
                            }
                        }
                    }
                }

                if (this.highlight_point) {

                    ctx.font = "10px Arial";
                    ctx.strokeStyle = "rgba(100,0,200,1)";
                    ctx.fillStyle = "rgba(100,0,200,1)";
                    ctx.fillText(this.highlight_point.t, (this.tgraph.X(this.highlight_point.x2 + 1)), (this.tgraph.Y(this.highlight_point.y)));
                    ctx.fillStyle = "rgba(0, 0, 255, 0.1)";
                    const x = this.tgraph.X(this.highlight_point.x1);
                    const y = this.tgraph.Y(this.highlight_point.y);
                    const width = this.tgraph.screenWidth(this.highlight_point.x2 - this.highlight_point.x1);
                    const height = this.tgraph.screenHeight(this.highlight_point.y);
                    ctx.fillRect(x, y, width, height);

                }

            } catch (exception) {
                console.log(' ex ' + exception)
                this.reloadSVGs();
            }

        }
        async drawPlot(ctx, parentTrack, __track) {
            const graph = parentTrack.grid;
            if (!this.visible) {
                return;
            }
            if (this.svgs && this.svgs.length > 0 && this.track_layer_imgs.length === 0) {
                this.reloadSVGs();
            }
            let screencell = graph.screenWidth((1))
            try {
                for (let s of this.track_layer_imgs) {
                    ctx.drawImage(s, this.tgraph.xi, this.tgraph.yi, this.tgraph.width, this.tgraph.height);
                }

                if (this.annotations && this.annotations.length > 0) {
                    const groups = {};
                    let annot = this.annotations;
                    annot.forEach(annotation => {
                        if (!groups[annotation.name]) {
                            groups[annotation.name] = [];
                        }
                        groups[annotation.name].push(annotation.xi);
                    });
                    Object.keys(groups).forEach((name, index) => {
                        const xis = groups[name].sort((a, b) => a - b);
                        const color = this.color;
                        for (let i = 0; i < xis.length - 1; i++) {
                            const xCenter = ((this.tgraph.X(xis[i])) + (this.tgraph.X(xis[i + 1]))) / 2;
                            const yCenter = (this.tgraph.yi + this.tgraph.height);
                            const radius = ((this.tgraph.X(xis[i + 1])) - (this.tgraph.X(xis[i]))) / 2;

                            ctx.beginPath();
                            ctx.strokeStyle = color;
                            ctx.lineWidth = 1;
                            ctx.arc(xCenter, yCenter, radius, 0, Math.PI, true);
                            ctx.stroke();

                            const arcTopX = xCenter;
                            const arcTopY = yCenter - radius;

                            ctx.save();

                            ctx.translate(arcTopX, arcTopY);
                            ctx.rotate(45 * Math.PI / 180);

                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'bottom';
                            ctx.font = "10px Arial";
                            ctx.fillStyle = color;
                            ctx.fillText(name, 0, 0);

                            ctx.restore();
                        }
                    });
                    for (let a of this.annotations) {
                        a.draw(graph, __track);
                    }
                }
                ctx.fillStyle = this.fillstyle;
                ctx.lineWidth = 2;
                ctx.lineCap = 'butt';
                ctx.textBaseline = 'middle';
                ctx.font = "10px Arial";
                let n = 1;

                if (this.polygonpts && this.polygonpts.length > 2) {
                    if (screencell > 0.5) {
                        ctx.beginPath();
                        if (this.polygon_type == 'fill') {
                            ctx.moveTo(this.tgraph.X(this.polygonpts[0].x + 1), this.tgraph.Y(0));
                            ctx.lineTo(this.tgraph.X(this.polygonpts[0].x + 1), this.tgraph.Y(this.polygonpts[0].y));
                        } else {
                            let xsc = this.tgraph.X(this.polygonpts[0].x + 1);
                            ctx.moveTo(xsc, this.tgraph.Y(this.polygonpts[0].y));
                        }
                        for (let pi = 1; pi < this.polygonpts.length; pi += n) {
                            let ppts = this.polygonpts[pi]
                            ctx.lineTo(this.tgraph.X(ppts.x + 1), this.tgraph.Y(ppts.y));
                        }
                        if (this.polygon_type == 'fill') {
                            ctx.lineTo(this.tgraph.X(this.polygonpts[this.polygonpts.length - 1].x + 1), this.tgraph.Y(0));
                        }
                        if (this.polygon_type == 'fill') {
                            ctx.closePath();
                            ctx.fill();
                        } else {
                            ctx.stroke();
                        }
                    } else {
                        if (this.polygonpts && this.polygonpts.length > 40000 && (!this.npts_transient_ || this.npts_transient_.length <= 0)) {
                            const epsilon = 0.7;
                            this.npts_transient_ = this.douglasPeucker(this.polygonpts, epsilon);

                        }

                        ctx.beginPath();
                        if (this.polygon_type == 'fill') {
                            ctx.moveTo(this.tgraph.X(this.polygonpts[0].x + 1), this.tgraph.Y(0));
                            ctx.lineTo(this.tgraph.X(this.polygonpts[0].x + 1), this.tgraph.Y(this.polygonpts[0].y));
                        } else {
                            let xvalue = this.polygonpts[0].x;
                            let xsc = this.tgraph.X(this.polygonpts[0].x + 1);
                            ctx.moveTo(xsc, this.tgraph.Y(this.polygonpts[0].y));
                        }

                        if (this.npts_transient_ && this.npts_transient_.length > 10) {
                            const n = Math.ceil((10000 / this.npts_transient_.length) * 10);

                            for (let pi = 1; pi < this.npts_transient_.length; pi += n) {
                                let ppts = this.npts_transient_[pi]
                                let xsc = this.tgraph.X(this.npts_transient_[pi].x + 1);
                                ctx.lineTo(xsc, this.tgraph.Y(ppts.y));

                            }

                        } else {
                            if (this.polygonpts && this.polygonpts.length > 0)
                                for (let pi = 1; pi < this.polygonpts.length; pi += n) {
                                    let ppts = this.polygonpts[pi]
                                    let xsc = this.tgraph.X(this.polygonpts[pi].x + 1);
                                    ctx.lineTo(xsc, this.tgraph.Y(ppts.y));
                                }

                        }

                        if (this.npts_transient_ && this.npts_transient_.length > 0 && this.polygon_type == 'fill') {
                            ctx.lineTo(this.tgraph.X(this.npts_transient_[this.npts_transient_.length - 1].x + 1), this.tgraph.Y(0));
                        }
                        if (this.polygon_type == 'fill') {
                            ctx.closePath();
                            ctx.fill();
                        } else {
                            ctx.stroke();
                        }

                    }
                }

                ctx.lineWidth = 4;
                ctx.lineCap = 'butt';
                ctx.textBaseline = 'middle';
                ctx.font = this.defaultFont;

                ctx.strokeStyle = "rgba(100,100,0,1)";
                ctx.fillStyle = this.color;
                for (let int of this.intervals) {
                    ctx.beginPath();
                    ctx.moveTo((this.tgraph.X(int.x1)), (this.tgraph.Y(int.y)));
                    ctx.lineTo((this.tgraph.X(int.x2)), (this.tgraph.Y(int.y)));
                    const x = this.tgraph.X(int.x1);
                    const y = this.tgraph.Y(int.y);
                    const width = this.tgraph.screenWidth(int.x2 - int.x1);
                    const height = this.tgraph.screenHeight(int.y);
                    if (this.highlight) {
                        ctx.fillStyle = "magenta";
                        ctx.strokeStyle = "magenta";
                        ctx.lineWidth = 14;
                    } else if (int.color) {
                        ctx.fillStyle = int.color;
                        ctx.strokeStyle = int.color;

                    }
                    else {
                        ctx.fillStyle = this.color;
                        ctx.strokeStyle = this.color;
                    }

                    // When highlighted, keep a minimum on-screen width so narrow
                    // intervals stay visible even when the view is zoomed way out.
                    let drawWidth = width;
                    if (this.highlight && Math.abs(drawWidth) < 5) drawWidth = 5;
                    ctx.fillRect(x, y, drawWidth, height);

                    if (screencell > (this.labelZoomThreshold != null ? this.labelZoomThreshold : 0.4)) {
                        let text;
                        if (int.t) {
                            text = int.t;
                        } else {
                            text = this.name;
                        }
                        ctx.fillStyle = 'black';

                        ctx.fillStyle = 'black';
                        const maxWidth = 300;
                        const lineHeight = 15;
                        const lines = this.wrapText(ctx, text, maxWidth);
                        let screeny = this.tgraph.Y(int.y);
                        let screenx = this.tgraph.X(int.x2 + 1)
                        if (screenx > 0 || screenx < graph.grid.width - 100 || screeny > 0 || screeny < graph.grid.height - 100) {

                            lines.forEach((line) => {
                                ctx.fillText(line, screenx, screeny);
                                screeny += 15;
                            });
                            ctx.fillStyle = this.defaultColor;

                        }
                        ctx.stroke();
                    }
                }

                if (this.highlight_text.length > 0) {
                    for (let ht of this.highlight_text) {
                        const lowerSearchString = ht.toLowerCase().trim();
                        const foundSubstrings = this.intervals.reduce((matches, item) => {
                            const lowerItem = ('' + (item && item.t || '')).toLowerCase();
                            if (lowerItem.includes(lowerSearchString.trim())) {
                                matches.push(item);
                            }
                            return matches;
                        }, []);
                        if (foundSubstrings != null && foundSubstrings.length > 0) {
                            ctx.font = "10px Arial";
                            ctx.strokeStyle = "rgba(200,0,0,1)";
                            ctx.fillStyle = "rgba(200,0,0,1)";

                            for (let f of foundSubstrings) {
                                ctx.fillText(f.t, (this.tgraph.X(f.x2 + 1)), (this.tgraph.Y(f.y)));
                            }
                        }
                    }
                }

                if (this.highlight_point) {

                    ctx.font = "10px Arial";
                    ctx.strokeStyle = "rgba(100,0,200,1)";
                    ctx.fillStyle = "rgba(100,0,200,1)";
                    ctx.fillText(this.highlight_point.t, (this.tgraph.X(this.highlight_point.x2 + 1)), (this.tgraph.Y(this.highlight_point.y)));
                    ctx.fillStyle = "rgba(0, 0, 255, 0.5)";
                    const x = this.tgraph.X(this.highlight_point.x1);
                    const y = this.tgraph.Y(this.highlight_point.y);
                    const width = this.tgraph.screenWidth(this.highlight_point.x2 - this.highlight_point.x1);
                    const height = this.tgraph.screenHeight(this.highlight_point.y);
                    ctx.fillRect(x, y, width, height);

                }

            } catch (exception) {
                console.log(' ex ' + exception)
                this.reloadSVGs();
            }

        }
    }
    resolve(TrackLayer);
});
