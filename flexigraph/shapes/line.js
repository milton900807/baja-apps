function () {
    return new Promise(async (resolve, reject) => {

        class Line {
            name;
            x;
            y;
            xf;
            yf;
            color = 'black';
            type = 'line';
            w = 0;
            h = 0;
            comment = '';
            hl = false;
            arrowDirect = 'end';        // the head goes where you DRAGGED TO
            linewidth = 3;
            // Was displayThreshold = 25, which SKIPPED THE WHOLE DRAW when the arrow was
            // under 25px in both axes -- so a short arrow, or any arrow once the view was
            // zoomed out, silently disappeared and came back on zoom in. An annotation that
            // vanishes is worse than a small one: the user cannot tell it from a lost edit.
            // Now only a degenerate arrow is skipped.
            minScreenPx = 2;
            hitTolerance = 8;           // px either side of the shaft that count as a click

            constructor(name, x, y) {
                this.name = name;
                this.x = x;
                this.y = y;
                this.xf = x;
                this.yf = y;
                this.w = 0;
                this.h = 0;
            }

            setColor(color) {
                this.color = color;
            }

            move(x, y) {
                if (x == null || y == null) return;

                const dx = this.xf - this.x;
                const dy = this.yf - this.y;

                this.x = x;
                this.y = y;
                this.xf = x + dx;
                this.yf = y + dy;

                this.w = this.xf - this.x;
                this.h = this.yf - this.y;
            }

            update(x, y) {
                this.xf = x;
                this.yf = y;
                this.w = this.xf - this.x;
                this.h = this.yf - this.y;
            }

            invertX() {
                const tx = this.x;
                this.x = this.xf;
                this.xf = tx;
                this.w = this.xf - this.x;
                if (this.arrowDirect === 'start')
                    this.arrowDirect = 'end'
                else if (this.arrowDirect === 'end')
                    this.arrowDirect = 'start'
            }

            invertY() {
                const ty = this.y;
                this.y = this.yf;
                this.yf = ty;
                this.h = this.yf - this.y;
            }

            highlight(v) {
                this.hl = v;
            }

            // Distance from a point to the SEGMENT, in the shape's own units.
            distanceTo(x, y) {
                const dx = this.xf - this.x, dy = this.yf - this.y;
                const len2 = dx * dx + dy * dy;
                if (!(len2 > 0)) return Math.hypot(x - this.x, y - this.y);
                // Clamped projection, so the nearest point is on the segment rather than on
                // the infinite line through it.
                let t = ((x - this.x) * dx + (y - this.y) * dy) / len2;
                t = Math.max(0, Math.min(1, t));
                return Math.hypot(x - (this.x + t * dx), y - (this.y + t * dy));
            }

            // A click within `tol` of the SHAFT selects it.
            //
            // This used to be a bounding-box test, which for a diagonal arrow claimed the whole
            // rectangle it spans -- a click nowhere near the line selected it, and on a busy
            // canvas the arrow stole clicks from everything underneath. A near-horizontal
            // arrow had the opposite problem: a box a couple of pixels tall, impossible to hit.
            //
            // `tol` is in the shape's units and is supplied by the caller when it knows the
            // scale; the fallback is used when it does not.
            isIn(x, y, tol) {
                const t = (tol != null && isFinite(tol)) ? tol : this.hitTolerance;
                const hit = this.distanceTo(x, y) <= t;
                this.hl = hit;
                return hit;
            }

            angle(cx, cy, ex, ey) {
                return Math.atan2(ey - cy, ex - cx);
            }

            angle360(cx, cy, ex, ey) {
                let theta = this.angle(cx, cy, ex, ey);
                if (theta < 0) theta += 2 * Math.PI;
                return theta;
            }

            drawLine(ctx, xi, yi, xf, yf, color = 'black', lineSize = 2, lineCap = 'butt', shadow = null) {
                if (!ctx) return;

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(xi, yi);
                ctx.lineTo(xf, yf);

                ctx.strokeStyle = color;
                ctx.lineWidth = lineSize;
                ctx.lineCap = lineCap;

                if (shadow) {
                    ctx.shadowBlur = shadow.blur ?? 6;
                    ctx.shadowColor = shadow.color ?? 'rgba(0,0,0,0.35)';
                    ctx.shadowOffsetX = shadow.offsetX ?? 2;
                    ctx.shadowOffsetY = shadow.offsetY ?? 2;
                } else {
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                }

                ctx.stroke();
                ctx.restore();
            }

            drawArrowhead(ctx, x, y, angle, width = 8, length = 12, color = 'black') {
                if (!ctx) return;

                ctx.save();
                ctx.translate(x, y);

                ctx.rotate(angle + Math.PI);

                ctx.fillStyle = color;

                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-length, width / 2);
                ctx.lineTo(-length, -width / 2);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }

            // The comment as a CHIP, not bare text.
            //
            // It was drawn as plain blue 14px straight onto the canvas: unreadable over a dark
            // track or a colored layer, running off the edge when the arrow ended near one,
            // and with no bound on length so a sentence ran across the whole view. A filled
            // rounded box with a leader keeps it legible over anything and keeps it on screen.
            drawComment(ctx, x, y, text) {
                if (!ctx || !text) return;
                const label = ('' + text).replace(/\s+/g, ' ').trim();
                if (!label) return;

                ctx.save();
                ctx.font = '12px system-ui, -apple-system, Roboto, Arial, sans-serif';
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'left';

                // One line, ellipsised. A comment is a label here; the full text lives on the
                // shape and in the annotation panel.
                const MAX_W = 260;
                let shown = label;
                if (ctx.measureText(shown).width > MAX_W) {
                    while (shown.length > 1 && ctx.measureText(shown + '\u2026').width > MAX_W) {
                        shown = shown.slice(0, -1);
                    }
                    shown += '\u2026';
                }
                const padX = 7, padY = 5;
                const tw = ctx.measureText(shown).width;
                const bw = tw + padX * 2, bh = 12 + padY * 2;

                // Placed up and to the right of the head, then CLAMPED into the canvas so an
                // arrow drawn near an edge still shows its label.
                let bx = x + 16, by = y - 16 - bh;
                try {
                    const cw = ctx.canvas ? ctx.canvas.width : 0;
                    const ch = ctx.canvas ? ctx.canvas.height : 0;
                    if (cw) bx = Math.max(4, Math.min(bx, cw - bw - 4));
                    if (ch) by = Math.max(4, Math.min(by, ch - bh - 4));
                } catch (e) { }

                // Leader from the arrow head to the chip, so a clamped chip still reads as
                // belonging to this arrow rather than floating.
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(bx + Math.min(bw / 2, 14), by + bh);
                ctx.strokeStyle = 'rgba(120,140,160,0.85)';
                ctx.lineWidth = 1;
                ctx.stroke();

                const r = 6;
                ctx.beginPath();
                if (ctx.roundRect) { ctx.roundRect(bx, by, bw, bh, r); }
                else {
                    ctx.moveTo(bx + r, by);
                    ctx.lineTo(bx + bw - r, by); ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
                    ctx.lineTo(bx + bw, by + bh - r); ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
                    ctx.lineTo(bx + r, by + bh); ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
                    ctx.lineTo(bx, by + r); ctx.quadraticCurveTo(bx, by, bx + r, by);
                }
                ctx.closePath();
                ctx.fillStyle = 'rgba(255,255,255,0.96)';
                ctx.fill();
                ctx.strokeStyle = this.hl ? 'rgba(200,40,40,0.9)' : 'rgba(16,24,40,0.28)';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.fillStyle = '#16202c';
                ctx.fillText(shown, bx + padX, by + bh / 2);
                ctx.restore();
            }

            draw(graph, options = {}) {
                const ctx = graph.canvas.getCTX();
                if (!ctx) return;

                const { useShadow = true } = options;

                const xi = graph.X(this.x);
                const yi = graph.Y(this.y);
                const xf = graph.X(this.xf);
                const yf = graph.Y(this.yf);

                const dx = xf - xi, dy = yf - yi;
                const len = Math.hypot(dx, dy);
                // Only a DEGENERATE arrow is skipped. The old test hid anything under 25px in
                // both axes, which made short arrows disappear and every arrow disappear when
                // the view was zoomed out.
                if (!(len > this.minScreenPx)) return;

                const strokeColor = this.hl ? '#d33a2c' : this.color;
                const lw = Math.max(1, this.linewidth);
                // The head scales with the stroke, so a thick arrow does not end in a pinhead
                // and a thin one is not swamped. Capped against the arrow's own length so a
                // short arrow is not all head.
                const headLen = Math.max(8, Math.min(lw * 5.5, len * 0.42));
                const headW = Math.max(6, headLen * 0.62);

                const ux = dx / len, uy = dy / len;
                const heads = (this.arrowDirect === 'both')
                    ? ['start', 'end']
                    : [(this.arrowDirect === 'start') ? 'start' : 'end'];

                // THE SHAFT STOPS SHORT OF EACH HEAD. Drawn to the exact endpoint it pokes
                // through the tip of the triangle and out the other side, which is what made
                // the arrow look hand-drawn at any real line width.
                const backOff = headLen * 0.85;
                let sx = xi, sy = yi, ex = xf, ey = yf;
                if (heads.indexOf('start') >= 0) { sx += ux * backOff; sy += uy * backOff; }
                if (heads.indexOf('end') >= 0) { ex -= ux * backOff; ey -= uy * backOff; }

                this.drawLine(ctx, sx, sy, ex, ey, strokeColor, lw, 'round',
                    useShadow ? { blur: 6, color: 'rgba(16,24,40,0.30)', offsetX: 1, offsetY: 2 } : null);

                // A HEAD POINTS AWAY FROM THE OTHER END.
                //
                // drawArrowhead puts the TIP at (x,y) and extends the body along the direction
                // of `angle` -- it draws to local x = -length and then rotates by angle + PI,
                // which maps local -x onto +angle. So the angle passed is where the BODY goes,
                // not where the tip points, and a head at the end therefore takes the
                // end -> start direction. Passing the direction of travel puts the triangle
                // beyond the endpoint with its tip aimed back down the shaft.
                const towardEnd = Math.atan2(dy, dx);         // start -> end
                const towardStart = Math.atan2(-dy, -dx);     // end -> start
                for (const h of heads) {
                    // body back along the shaft, tip outward, at whichever end carries it
                    if (h === 'start') this.drawArrowhead(ctx, xi, yi, towardEnd, headW, headLen, strokeColor);
                    else this.drawArrowhead(ctx, xf, yf, towardStart, headW, headLen, strokeColor);
                }

                // A selected arrow gets a soft halo rather than only a color change, so it is
                // findable on a canvas that already has red on it.
                if (this.hl) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(xi, yi); ctx.lineTo(xf, yf);
                    ctx.strokeStyle = 'rgba(211,58,44,0.22)';
                    ctx.lineWidth = lw + 8;
                    ctx.lineCap = 'round';
                    ctx.stroke();
                    ctx.restore();
                }

                if (this.comment) {
                    // Anchored on the head the arrow actually points with.
                    const tipX = (heads[heads.length - 1] === 'start') ? xi : xf;
                    const tipY = (heads[heads.length - 1] === 'start') ? yi : yf;
                    this.drawComment(ctx, tipX, tipY, this.comment);
                }
            }
        }

        resolve(Line)
    })
}
