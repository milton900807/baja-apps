function () {
    return new Promise(async (resolve, reject) => {
        // Professional folder for the sketch tools: rounded tabbed folder with a warm
        // gradient and a soft shadow. Same interface as Folder.
        let SketchFolder = class SketchFolder {
            name;
            x = 0;
            y = 0;
            w = 0.0000000000000001;
            h = 0.0000000000000001;
            type = 'sketch-folder';
            color = '#f0c04a';
            tabColor = '#ffd766';
            edge = '#c99a2e';
            comment = '';
            hl = false;
            font = 'Arial';
            font_size = 14;

            constructor(name, x, y) { this.name = name; this.x = x; this.y = y; }
            setColor(c) { if (c) this.color = c; }
            highlight(v) { this.hl = v; }
            isIn(x, y) {
                if (x >= this.x && x < (this.x + this.w) && y < this.y && y > this.y - this.h) { this.hl = true; return true; }
                this.hl = false; return false;
            }
            update(x, y) { this.w = x - this.x; this.h = this.y - y; }
            folderPath(c, x, y, w, h) {
                const tabW = w * 0.34, tabH = Math.min(h * 0.24, 22), r = Math.min(8, w * 0.06, h * 0.06);
                const tabX = x + w * 0.06;
                c.beginPath();
                c.moveTo(x, y + tabH + r);
                c.arcTo(x, y + tabH, x + r, y + tabH, r);
                c.lineTo(tabX, y + tabH);
                c.lineTo(tabX + tabW * 0.20, y + r);
                c.arcTo(tabX + tabW * 0.20, y, tabX + tabW * 0.30, y, r);
                c.lineTo(tabX + tabW, y);
                c.lineTo(tabX + tabW + w * 0.06, y + tabH);
                c.lineTo(x + w - r, y + tabH);
                c.arcTo(x + w, y + tabH, x + w, y + tabH + r, r);
                c.lineTo(x + w, y + h - r);
                c.arcTo(x + w, y + h, x + w - r, y + h, r);
                c.lineTo(x + r, y + h);
                c.arcTo(x, y + h, x, y + h - r, r);
                c.closePath();
            }
            draw(graph, ctx) {
                let x = graph.X(this.x), y = graph.Y(this.y), w = graph.screenWidth(this.w), h = graph.screenHeight(this.h);
                if (w < 0) { x += w; w = Math.abs(w); }
                if (h < 0) { y += h; h = Math.abs(h); }
                if (w < 10 || h < 10) return;
                const c = ctx || (graph.canvas && graph.canvas.getCTX && graph.canvas.getCTX());
                if (!c) return;
                c.save();
                c.shadowColor = 'rgba(16,24,40,0.28)'; c.shadowBlur = 12; c.shadowOffsetY = 4;
                this.folderPath(c, x, y, w, h);
                const g = c.createLinearGradient(0, y, 0, y + h);
                g.addColorStop(0, this.tabColor); g.addColorStop(1, this.color);
                c.fillStyle = g; c.fill();
                c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
                c.lineWidth = this.hl ? 2.5 : 1.4;
                c.strokeStyle = this.hl ? '#ff8c1a' : this.edge;
                c.stroke();
                c.restore();
                if (this.comment) {
                    c.save();
                    c.fillStyle = '#4a3a10';
                    c.font = this.font_size + 'px ' + this.font;
                    c.textAlign = 'center'; c.textBaseline = 'middle';
                    c.fillText(this.comment, x + w / 2, y + h * 0.62);
                    c.restore();
                }
            }
        }
        resolve(SketchFolder)
    })
}
