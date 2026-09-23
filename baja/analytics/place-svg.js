function (pt, svgText, opts) {

    // PUT A DRAWING IN THE SPACE THE LAYOUT LEFT.
    //   await exec('baja/analytics/place-svg.js', pt, svgString, { widthFrac: 0.45 })
    //
    // A build lays its tables, folders and notes out with the tetris packer, which knows
    // the size of everything it is given. A picture that arrives AFTERWARDS is not one of
    // those things: it should not push the arrangement around, and it should not land on
    // top of it either. So it goes in a hole -- this looks for one, and only widens the
    // arrangement when there is no hole big enough.
    //
    // An SVG comes in through flexigraph's importer as a glyph, and the numbers in the
    // file become WORLD units: a drawing written 860 across is 860 world units across,
    // which next to a canvas of tables is either a postage stamp or a wall. It is scaled
    // to a fraction of what is already there before it is placed.
    //
    // Returns the glyph, or null if there was nothing to draw or the SVG would not parse.

    return (async () => {
        const o = opts || {};
        if (!pt || !svgText || typeof svgText !== 'string') return null;

        let Shape, Glyph, shape;
        try {
            Shape = await exec('flexigraph/shapes/shape.js');
            Glyph = await exec('baja/draw/glyph.js');
            shape = Shape.fromSvgString(svgText);
        } catch (e) { console.warn('[place-svg] parse', e); return null; }
        if (!shape) return null;

        const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : null;
        const bboxOf = (s) => {
            try {
                const x1 = num(s.getX && s.getX()), y1 = num(s.getY && s.getY());
                const x2 = num(s.getXf && s.getXf()), y2 = num(s.getYf && s.getYf());
                if (x1 == null || y1 == null || x2 == null || y2 == null) return null;
                return { x0: Math.min(x1, x2), x1: Math.max(x1, x2), y0: Math.min(y1, y2), y1: Math.max(y1, y2) };
            } catch (e) { return null; }
        };

        const own = bboxOf(shape);
        if (!own || !(own.x1 > own.x0) || !(own.y1 > own.y0)) { console.warn('[place-svg] no bounds'); return null; }

        // THE SIZE THE DRAWING SAYS IT IS, not the size its contents measure. A group's
        // bounds include every label's estimated extent, so a drawing whose type was made
        // one point larger measures WIDER and is then scaled DOWN to fit the same target --
        // enlarging the type made the whole picture smaller, which is the opposite of what
        // anyone asking for it wants. The width and height on the <svg> element are the
        // author's statement of the frame; the measured bounds are still what the placement
        // uses, because that is what will actually be covered.
        const declared = (() => {
            const w = /<svg[^>]*\swidth\s*=\s*"([\d.]+)"/i.exec(svgText);
            const h = /<svg[^>]*\sheight\s*=\s*"([\d.]+)"/i.exec(svgText);
            if (w && h) { const a = parseFloat(w[1]), b = parseFloat(h[1]); if (a > 0 && b > 0) return { w: a, h: b }; }
            const vb = /<svg[^>]*viewBox\s*=\s*"\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i.exec(svgText);
            if (vb) { const a = parseFloat(vb[1]), b = parseFloat(vb[2]); if (a > 0 && b > 0) return { w: a, h: b }; }
            return null;
        })();
        const srcW = declared ? declared.w : (own.x1 - own.x0);
        const srcH = declared ? declared.h : (own.y1 - own.y0);

        // What is already on the canvas, in world units.
        const boxes = [];
        for (const obj of [...(pt.root || []), ...(pt.m_plots || [])]) {
            if (!obj || obj.hidden) continue;
            const b = pt.worldBoxOf(obj);
            if (b && isFinite(b.x0) && isFinite(b.y1)) boxes.push(b);
        }

        const aspect = srcH / srcW;
        let wantW;
        if (boxes.length) {
            const bx0 = Math.min(...boxes.map(b => b.x0)), bx1 = Math.max(...boxes.map(b => b.x1));
            const by0 = Math.min(...boxes.map(b => b.y0)), by1 = Math.max(...boxes.map(b => b.y1));
            wantW = Math.max(1e-9, bx1 - bx0) * (num(o.widthFrac) || 0.55);
            // Never taller than the arrangement itself, or it drags the fit out of shape.
            const maxH = Math.max(1e-9, (by1 - by0) * (num(o.maxHeightFrac) || 0.9));
            if (wantW * aspect > maxH) wantW = maxH / aspect;
        } else {
            wantW = srcW;
        }

        // THE CANVAS'S WORLD UNITS ARE NOT SQUARE. One world unit across and one world unit
        // down are different numbers of pixels, and a drawing scaled by the same factor on
        // both axes therefore arrives squashed: measured on the analytics canvas, a figure
        // authored 1000 x 698 came out at roughly 0.57 of its proper height. Worse, a
        // circle is drawn from the HORIZONTAL scale alone (grid.screenWidth(r)), so the
        // nodes kept their size while the space between them shrank until they touched.
        //
        // So the vertical scale carries the ratio. After this the figure has the
        // proportions it was drawn with, whatever the camera is doing.
        const scale = wantW / srcW;
        let anis = 1;
        try {
            const g = pt.grid; g.rescale();
            const kx = Math.abs(g.screenWidth(1)), ky = Math.abs(g.screenHeight(1));
            if (kx > 0 && ky > 0 && isFinite(kx / ky)) anis = kx / ky;
        } catch (e) { anis = 1; }
        try { Shape.svgScaleAbout(shape, scale, scale * anis, 0, 0); } catch (e) { console.warn('[place-svg] scale', e); }

        // What it will actually cover, measured after the scaling rather than assumed: a
        // label that overhangs the frame still has to be kept off the tables.
        const after = bboxOf(shape) || { x0: 0, x1: wantW, y0: 0, y1: wantW * aspect };
        const W = Math.max(1e-9, after.x1 - after.x0);
        const H = Math.max(1e-9, after.y1 - after.y0);

        // ---- where it goes ---------------------------------------------------------------
        // The gap is generous on purpose. A text shape's extent is an estimate -- the group
        // bounds are built from the geometry, and a label can measure wider when it is
        // actually drawn -- so "just touching" is not a margin worth having.
        const gap = (boxes.length ? (W * 0.10) : 0);
        const hits = (x0, y0) => {
            const x1 = x0 + W, y1 = y0 + H;
            for (const b of boxes) {
                if (x0 < b.x1 + gap && b.x0 - gap < x1 && y0 < b.y1 + gap && b.y0 - gap < y1) return true;
            }
            return false;
        };

        let place = null;
        if (!boxes.length) {
            const g = pt.grid; g.rescale();
            place = { x: g.Xwc(g.width * 0.5) - W / 2, y: g.Ywc(g.height * 0.5) - H / 2 };
        } else {
            const bx0 = Math.min(...boxes.map(b => b.x0)), bx1 = Math.max(...boxes.map(b => b.x1));
            const by0 = Math.min(...boxes.map(b => b.y0)), by1 = Math.max(...boxes.map(b => b.y1));
            // Sweep the arrangement and one drawing's width past its right edge. The score
            // prefers a hole INSIDE what is already there -- that is the space the eye reads
            // as empty -- and among holes, the one nearest the top right, which is where a
            // packer that fills from the bottom left tends to leave room.
            const stepX = Math.max((bx1 - bx0) / 60, W / 12);
            const stepY = Math.max((by1 - by0) / 60, H / 12);
            let best = null;
            for (let x = bx0; x <= bx1 + W; x += stepX) {
                for (let y = by0; y <= by1; y += stepY) {
                    if (hits(x, y)) continue;
                    const inside = (x + W <= bx1 + 1e-9) ? 0 : 1;      // 0 sorts first
                    const d = Math.abs((bx1 - (x + W))) + Math.abs((by1 - (y + H)));
                    const score = inside * 1e12 + d;
                    if (!best || score < best.score) best = { x, y, score };
                }
            }
            place = best ? { x: best.x, y: best.y }
                : { x: bx1 + (bx1 - bx0) * 0.04, y: by1 - H };        // nothing free: alongside
        }

        try { shape.svgTranslate(place.x + W / 2, place.y + H / 2); } catch (e) { console.warn('[place-svg] move', e); }

        let glyph = null;
        try {
            glyph = new Glyph(shape);
            if (o.name) { try { glyph.name = o.name; } catch (e) { } }
            // Quietly: a picture a build put down is not something the person just dropped
            // on the canvas and is about to move, so it must not arrive selected with the
            // move tool armed over it.
            if (typeof pt.addGlyphQuietly === 'function') pt.addGlyphQuietly(glyph);
            else pt.addGlyph(glyph);
        } catch (e) { console.warn('[place-svg] add', e); return null; }

        try { const g = CurrentLayout.getStashed('graph'); if (g && g.touchMe) g.touchMe(); } catch (e) { }
        return glyph;
    })();
}
