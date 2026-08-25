function () {
    return new Promise(async (resolve, reject) => {
        // Professional ellipse for the sketch tools: translucent fill, soft shadow,
        // crisp accent stroke. Same interface as Oval.
        let SketchOval = class SketchOval {
            name;
            x;
            y;
            w = 1;
            h = 1;
            type = 'sketch-oval';
            color = '#0c7c86';
            comment = '';
            hl = false;
            font = 'Arial';
            font_size = 16;

            constructor(name, x, y) { this.name = name; this.x = x; this.y = y; }
            setColor(c) { if (c) this.color = c; }
            highlight(v) { this.hl = !!v; }
            isIn(x, y) {
                const minX = Math.min(this.x, this.x + this.w), maxX = Math.max(this.x, this.x + this.w);
                const minY = Math.min(this.y, this.y - this.h), maxY = Math.max(this.y, this.y - this.h);
                const inside = x >= minX && x <= maxX && y >= minY && y <= maxY;
                this.hl = inside; return inside;
            }
            update(x, y) { if (x == null || y == null) return; this.w = x - this.x; this.h = this.y - y; }
            draw(graph, ctx) {
                if (!graph || !graph.canvas) return;
                const c = ctx || (graph.canvas.getCTX && graph.canvas.getCTX());
                if (!c) return;
                let x = graph.X(this.x), y = graph.Y(this.y), w = graph.screenWidth(this.w), h = graph.screenHeight(this.h);
                if (w < 0) { x += w; w = Math.abs(w); }
                if (h < 0) { y += h; h = Math.abs(h); }
                if (w < 6 || h < 6) return;
                const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
                c.save();
                c.shadowColor = 'rgba(16,24,40,0.22)'; c.shadowBlur = 10; c.shadowOffsetY = 3;
                c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                c.fillStyle = this.hl ? 'rgba(255,140,26,0.16)' : 'rgba(18,194,224,0.14)';
                c.fill();
                c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
                c.lineWidth = this.hl ? 2.5 : 1.8;
                c.strokeStyle = this.hl ? '#ff8c1a' : this.color;
                c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.stroke();
                c.restore();
                if (this.comment) {
                    c.save();
                    c.fillStyle = '#0f2a2e';
                    c.font = this.font_size + 'px ' + this.font;
                    c.textAlign = 'center'; c.textBaseline = 'middle';
                    c.fillText(this.comment, cx, cy);
                    c.restore();
                }
            }
        }
        resolve(SketchOval)
    })
}
