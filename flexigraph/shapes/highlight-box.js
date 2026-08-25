function () {
    return new Promise(async (resolve, reject) => {

        // A professional region-highlight: a translucent filled box with a thin solid
        // border (no dashed outline). Same shape interface as Rectangle.
        let HighlightBox = class HighlightBox {
            name;
            x;
            y;
            w = 0.0000000000000001;
            h = 0.0000000000000001;
            type = 'highlight-box';   // must match filename for shape-factory reload
            color = '#12c2e0';
            comment = '';
            font = 'Arial';
            font_size = '16px';
            showRect = true;
            hl = false;

            constructor(name, x, y) {
                this.name = name;
                this.x = x;
                this.y = y;
            }
            setColor(color) { if (color) this.color = color; }
            highlight(v) { this.hl = v; }

            isIn(x, y) {
                if (x >= this.x && x < (this.x + this.w) &&
                    y < this.y && y > this.y - this.h) {
                    this.hl = true;
                    return true;
                }
                this.hl = false;
                return false;
            }
            update(x, y) {
                this.w = x - this.x;
                this.h = this.y - y;
            }

            draw(graph, ctx) {
                let sw = graph.screenWidth(this.w);
                let sh = graph.screenHeight(this.h);
                if (Math.abs(sw) < 4 || Math.abs(sh) < 4) return;

                let x = graph.X(this.x);
                let y = graph.Y(this.y);
                let w = sw, h = sh;
                if (w < 0) { x += w; w = Math.abs(w); }
                if (h < 0) { y += h; h = Math.abs(h); }

                const c = ctx || (graph.canvas && graph.canvas.getCTX && graph.canvas.getCTX());
                if (c) {
                    c.save();
                    // Translucent wash — orange when selected, cyan otherwise.
                    c.fillStyle = this.hl ? 'rgba(255,140,26,0.22)' : 'rgba(18,194,224,0.16)';
                    c.fillRect(x, y, w, h);
                    // Thin, crisp solid border (no dashes).
                    c.lineWidth = 1.25;
                    c.strokeStyle = this.hl ? 'rgba(255,140,26,0.95)' : 'rgba(18,194,224,0.75)';
                    c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
                    c.restore();
                } else {
                    graph.drawRect(x, y, w, h, this.hl ? '#ff8c1a' : '#12c2e0', 1);
                }

                if (this.comment) {
                    graph.drawString(this.comment, this.x + this.w / 2, this.y - this.h / 2, this.color || 'blue');
                }
            }
        }
        resolve(HighlightBox)
    })
}
