function () {
    return new Promise(async (resolve, reject) => {
        // Professional rounded rectangle for the sketch tools: soft-shadowed card with a
        // translucent fill and a crisp accent border. Same interface as Rectangle.
        let SketchRect = class SketchRect {
            name;
            x;
            y;
            w = 0.0000000000000001;
            h = 0.0000000000000001;
            type = 'sketch-rect';
            color = '#0c7c86';
            fill = 'rgba(255,255,255,0.82)';
            comment = '';
            font = 'Arial';
            font_size = 16;
            hl = false;

            constructor(name, x, y) { this.name = name; this.x = x; this.y = y; }
            setColor(c) { if (c) this.color = c; }
            highlight(v) { this.hl = v; }
            isIn(x, y) {
                if (x >= this.x && x < (this.x + this.w) && y < this.y && y > this.y - this.h) { this.hl = true; return true; }
                this.hl = false; return false;
            }
            update(x, y) { this.w = x - this.x; this.h = this.y - y; }
            roundRect(c, x, y, w, h, r) {
                r = Math.max(0, Math.min(r, Math.min(Math.abs(w), Math.abs(h)) / 2));
                c.beginPath();
                c.moveTo(x + r, y);
                c.arcTo(x + w, y, x + w, y + h, r);
                c.arcTo(x + w, y + h, x, y + h, r);
                c.arcTo(x, y + h, x, y, r);
                c.arcTo(x, y, x + w, y, r);
                c.closePath();
            }
            draw(graph, ctx) {
                let sw = graph.screenWidth(this.w), sh = graph.screenHeight(this.h);
                if (Math.abs(sw) < 6 || Math.abs(sh) < 6) return;
                let x = graph.X(this.x), y = graph.Y(this.y), w = sw, h = sh;
                if (w < 0) { x += w; w = Math.abs(w); }
                if (h < 0) { y += h; h = Math.abs(h); }
                const c = ctx || (graph.canvas && graph.canvas.getCTX && graph.canvas.getCTX());
                if (!c) return;
                c.save();
                c.shadowColor = 'rgba(16,24,40,0.22)'; c.shadowBlur = 10; c.shadowOffsetY = 3;
                this.roundRect(c, x, y, w, h, 10);
                c.fillStyle = this.fill; c.fill();
                c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
                c.lineWidth = this.hl ? 2.5 : 1.6;
                c.strokeStyle = this.hl ? '#ff8c1a' : this.color;
                this.roundRect(c, x + 0.5, y + 0.5, w - 1, h - 1, 10);
                c.stroke();
                c.restore();
                if (this.comment) {
                    c.save();
                    c.fillStyle = '#0f2a2e';
                    c.font = this.font_size + 'px ' + this.font;
                    c.textAlign = 'center'; c.textBaseline = 'middle';
                    c.fillText(this.comment, x + w / 2, y + h / 2);
                    c.restore();
                }
            }
        }
        resolve(SketchRect)
    })
}
