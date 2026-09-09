return new Promise(async (resolve, reject) => {
    let TrackLayer = await exec('baja/bio/track-layer.js');

    // A diverging bar chart drawn ON the sequence, in the same coordinate idiom the
    // splice-site annotations use (flexigraph/gene-draw2.js):
    //
    //     x  ->  graph.X(tgraph.X(worldX))
    //     y  ->  graph.Y(tgraph.Y(worldY))
    //
    // A track's X()/Y() return INTERMEDIATE world coordinates, not pixels — grid.js says
    // so where it guards snapPixels — so the screen grid has to map them a second time.
    // Both axes need it. Reading the layer's own grid instead lands on the middle of the
    // layer box, which is what drew the first version half way up the track.
    //
    // The baseline is graph.Y(tgraph.Y(0)): a track's tgraph is built ymin = 0 / ymax = 1,
    // so 0 is the sequence line and 1 is the top of the track. That makes tgraph.Y(u) the
    // world y a fraction u up the track, which is all the bar heights need.
    let CisLayer = class extends TrackLayer {
        type = 'CisLayer';
        windows = [];          // {x0, x1, impact, z, covered}
        peak = 1;              // |impact| of the strongest window, for scaling
        site = null;           // track x of the splice site being profiled
        which = 'acceptor';
        refScore = null;
        amplitude = 0.82;      // a full-scale bar, as a fraction of the track height
        // Never label. The generic interval renderer labels a bar when the on-screen width
        // of a base clears this threshold, and it falls back to the LAYER NAME for any
        // interval whose own text is empty -- so a flattened copy printed the layer name
        // once per window. A big finite number switches that off for good; Infinity would
        // not survive a save, since JSON writes it as null and null falls back to 0.4.
        labelZoomThreshold = 1e9;
        supportRGB = [15, 110, 123];
        suppressRGB = [163, 64, 44];

        constructor(name, xmin, xmax, site, which, track) {
            super(name, xmin, -1, xmax, 1);
            this.site = site;
            this.which = which;
            this.data_type = 'Cis:' + which + '@' + site;
            // Non-enumerable: track.track_layers already points at this layer, and a
            // plain field would make the pair a cycle that breaks JSON save/reload.
            try {
                Object.defineProperty(this, 'track',
                    { value: track || null, enumerable: false, writable: true });
            } catch (e) { }
        }

        // The track's own grid, which is what turns a world coordinate into the pixels the
        // sequence is drawn at. Taken from the DRAW ARGUMENTS first and only then from the
        // stored reference: a layer that has been copied or reloaded loses that reference
        // (it is non-enumerable, so neither Object.assign nor JSON carries it), and without
        // it the layer declines and the generic renderer draws it half way up the track.
        // The track is handed to every draw call anyway, so it need not be remembered.
        trackGrid(args) {
            for (const c of (args || [])) {
                if (c && c !== this && (c.tgraph || c.grid) && Array.isArray(c.track_layers)) {
                    return c.tgraph || c.grid;
                }
            }
            return (this.track && (this.track.tgraph || this.track.grid)) || null;
        }

        addWindow(x0, x1, impact, z, covered) {
            this.windows.push({ x0: +x0, x1: +x1, impact: +impact, z: +z, covered: +covered });
            // Mirrored into the base interval list so the layer still renders, exports and
            // hit-tests after a save/reload, when it comes back as a plain TrackLayer with
            // no custom painter. Same picture, drawn by the generic interval renderer.
            this.addInterval(+x0, +x1, this.scaled(+impact), ' ', this.colorFor(+impact, +z, +covered));
            this.lastedit = new Date().getTime();
        }

        setPeak(p) {
            this.peak = (isFinite(p) && p > 0) ? p : 1;
            // Rescale the mirrored intervals: they were added before the peak was known.
            for (let i = 0; i < this.intervals.length && i < this.windows.length; i++) {
                this.intervals[i].y = this.scaled(this.windows[i].impact);
            }
        }

        scaled(impact) {
            const v = (impact / (this.peak || 1)) * this.amplitude;
            return Math.max(-this.amplitude, Math.min(this.amplitude, v));
        }

        colorFor(impact, z, covered) {
            const rgb = impact >= 0 ? this.supportRGB : this.suppressRGB;
            // Opacity carries confidence, so a window whose effect is inside the
            // scramble-to-scramble spread reads as noise instead of as a small effect,
            // and a partly padded window fades by how much of it was real sequence.
            const conf = Math.max(0, Math.min(1, Math.abs(z) / 4));
            const a = +((0.20 + 0.60 * conf) * (isFinite(covered) ? covered : 1)).toFixed(2);
            return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')';
        }

        // The render paths disagree about argument order: track-flexi calls
        // layer.drawPlot(plateTrack, track, ctx) while the base signature reads
        // (ctx, parentTrack, __track), and the base draw() derives its own context from
        // graph.canvas. Rather than bet on either, find the screen grid and the context
        // by what they can do, not by where they sit.
        resolveGraph(args) {
            const able = (c) => c && typeof c.X === 'function' && typeof c.Y === 'function'
                && typeof c.screenWidth === 'function';
            for (const c of args) if (able(c) && c.canvas) return c;   // the main graph
            for (const c of args) if (able(c)) return c;
            for (const c of args) if (c && able(c.grid)) return c.grid;
            return null;
        }

        resolveCtx(args, graph) {
            for (const c of args) {
                if (c && typeof c.fillRect === 'function' && typeof c.beginPath === 'function') return c;
            }
            for (const owner of [graph].concat(args)) {
                try {
                    const k = owner && owner.canvas && owner.canvas.getCTX && owner.canvas.getCTX();
                    if (k && typeof k.fillRect === 'function') return k;
                } catch (e) { }
            }
            return null;
        }

        // Teach the GENERIC interval renderer where the sequence line is.
        //
        // Several code paths rebuild a layer as a plain TrackLayer -- copyLayers on save,
        // and the loaders in load-track.js, gene.js and gene2plates.js, each with their own
        // dispatch. Such a copy keeps the intervals but loses this painter, and the generic
        // renderer anchors its bars at the layer's OWN Y(0), which for a symmetric grid is
        // the middle of the layer box: the saved plot jumping half way up the track.
        //
        // Instead of teaching every one of those paths about this class, the layer records
        // the answer in the one thing they all preserve -- its own grid. For a grid with
        // ymin = a, ymax = b the generic renderer's Y(0) lands at b/(b-a) of the box, so
        // picking a and b to put that at the sequence line makes the fallback draw in the
        // right place. The span is chosen so a full-scale bar is the same height there as
        // it is here, which makes the two renderings agree in size as well as position.
        syncFallbackGrid(y0, ampPx) {
            try {
                const g = this.tgraph;
                if (!g || typeof g.setymin !== 'function') return;
                const h = +g.height, yi = +g.yi;
                if (!isFinite(h) || !isFinite(yi) || Math.abs(h) < 1 || !(ampPx > 0)) return;
                const f = (y0 - yi) / h;
                const span = (h * this.amplitude) / ampPx;
                if (!isFinite(f) || !isFinite(span) || Math.abs(span) < 1e-9) return;
                const b = f * span, a = b - span;
                if (Math.abs((+g.ymax) - b) < 1e-9 && Math.abs((+g.ymin) - a) < 1e-9) return;
                g.setymin(a); g.setymax(b); g.rescale();
            } catch (e) { }
        }

        // Logged once per layer, not per frame: draw runs on every repaint and a
        // per-frame line would bury the console it is meant to help with.
        diag(msg) {
            if (this.__diagDone) return;
            this.__diagDone = true;
            try { console.log('CisLayer[' + this.data_type + '] ' + msg); } catch (e) { }
        }

        async draw(...a) {
            if (this.paint(a)) return;
            this.diag('custom paint declined, falling back to base draw');
            return super.draw(...a);
        }

        async drawPlot(...a) {
            if (this.paint(a)) return;
            this.diag('custom paint declined, falling back to base drawPlot');
            return super.drawPlot(...a);
        }

        paint(args) {
            if (!this.visible) return true;                 // hidden on purpose, nothing to draw
            if (!this.windows || !this.windows.length) return false;

            const graph = this.resolveGraph(args);
            const tg = this.trackGrid(args);
            // Without the track's own grid there is no way to reach the sequence line, and
            // drawing at the layer midpoint is exactly the bug this replaced. Decline, and
            // let the base interval renderer draw the mirrored copy instead.
            if (!graph || !tg || typeof tg.Y !== 'function') {
                this.diag('no screen grid or track grid; deferring to base renderer');
                return false;
            }
            const ctx = this.resolveCtx(args, graph);
            if (!ctx) return false;

            // graph.X(tgraph.X(x)) and graph.Y(tgraph.Y(y)), as gene-draw2.js draws the
            // splice-site symbols, so this lands on the same pixels they do.
            const px = (x) => graph.X(tg.X(x));
            const py = (y) => graph.Y(tg.Y(y));
            const y0 = py(0);                               // the sequence line

            // Bar direction is set explicitly, NOT taken from the mapping. Y() is a
            // decreasing function, so composing it twice (graph.Y of tgraph.Y) gives an
            // INCREASING one: read straight off, a positive impact drew downwards. Height
            // is therefore a signed pixel amount off the baseline, negative for up, so
            // support rises off the sequence and suppression hangs below it.
            const ampPx = Math.abs(py(this.amplitude) - y0);
            const barPx = (v) => -(v / this.amplitude) * ampPx;
            // Record this geometry for whatever renders the layer after it has been copied
            // or reloaded and is no longer a CisLayer.
            this.syncFallbackGrid(y0, ampPx);

            try {
                // Zero rule, only across the profiled span, so it reads as this layer's
                // baseline rather than as a rule across the whole track.
                const span = this.windows.reduce(
                    (acc, w) => [Math.min(acc[0], w.x0), Math.max(acc[1], w.x1)],
                    [Infinity, -Infinity]);
                ctx.fillStyle = 'rgba(128,128,128,0.45)';
                ctx.fillRect(px(span[0]), y0 - 0.5, px(span[1]) - px(span[0]), 1);

                for (const w of this.windows) {
                    const x = px(w.x0);
                    const width = px(w.x1) - x;
                    const h = barPx(this.scaled(w.impact));      // negative = up = supports
                    ctx.fillStyle = this.highlight ? 'magenta' : this.colorFor(w.impact, w.z, w.covered);
                    // Sub-pixel windows still have to be visible when zoomed out.
                    const dw = (Math.abs(width) < 1) ? (width < 0 ? -1 : 1) : width;
                    ctx.fillRect(x, y0, dw, h);
                }

                // The site itself, full height, so it is findable at any zoom.
                if (this.site != null && isFinite(+this.site)) {
                    ctx.fillStyle = 'rgba(200,30,30,0.75)';
                    ctx.fillRect(px(+this.site), y0 - ampPx, 1, 2 * ampPx);
                }

                // No per-bar value labels. With windows every 25 nt they overplot into
                // an unreadable band at any useful zoom, and the bar height and colour
                // already carry sign and magnitude. The numbers stay in the status line.
            } catch (e) {
                console.log('CisLayer paint error: ' + e);
                return false;
            }
            this.diag('drew ' + this.windows.length + ' windows at graph.Y(tgraph.Y(0))='
                + y0.toFixed(1) + ', full-scale bar ' + ampPx.toFixed(1)
                + 'px (support up, suppression down), peak ' + (+this.peak).toFixed(3));
            return true;
        }
    }

    // Restore a saved layer that came back as a plain object or a base TrackLayer.
    //
    // Setting a prototype does NOT run class field initialisers, so an object revived that
    // way has the methods but none of the defaults -- supportRGB undefined, and colorFor
    // then reads rgb[0] of undefined and the whole paint throws. A throwaway instance is
    // the source of truth for those defaults, so this stays correct as fields are added.
    // Only fields the saved object does not already carry are filled in.
    CisLayer.hydrate = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        try {
            Object.setPrototypeOf(obj, CisLayer.prototype);
            const defaults = new CisLayer('', 0, 1, 0, 'acceptor', null);
            for (const k of Object.keys(defaults)) {
                if (obj[k] === undefined) obj[k] = defaults[k];
            }
        } catch (e) { }
        return obj;
    };

    resolve(CisLayer);
});
