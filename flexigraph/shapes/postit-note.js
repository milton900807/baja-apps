function () {
    return new Promise(async (resolve, reject) => {
        // A sticky-note annotation: filled paper with a soft drop shadow and a folded
        // corner. Same interface as Rect-text's RectangleText (text auto-fits the note).
        let PostItNote = class PostItNote {
            name;
            x;
            y;
            w = 1;
            h = 1;

            color = '#3a3320';          // ink
            paper = '#fff59a';          // sticky-note yellow
            paperEdge = '#f4e46b';
            foldColor = '#e6d24f';
            highlightColor = '#ff8c1a';

            comment = '';
            type = 'postit-note';       // must match filename for shape-factory reload

            font = 'Arial';
            font_size = 18;
            minFontSize = 10;
            maxFontSize = 44;
            autoScaleText = true;

            showRect = true;
            hl = false;

            displayMinWidth = 12;
            displayMinHeight = 12;

            constructor(name, x, y) {
                this.name = name;
                this.x = x;
                this.y = y;
            }

            setColor(color) { if (color != null) this.color = color; }
            setText(text) { this.comment = text ?? ''; }
            highlight(v) { this.hl = !!v; }
            move(x, y) { if (x == null || y == null) return; this.x = x; this.y = y; }

            isIn(x, y) {
                const minX = Math.min(this.x, this.x + this.w);
                const maxX = Math.max(this.x, this.x + this.w);
                const minY = Math.min(this.y, this.y - this.h);
                const maxY = Math.max(this.y, this.y - this.h);
                const inside = x >= minX && x <= maxX && y >= minY && y <= maxY;
                this.hl = inside;
                return inside;
            }

            update(x, y) { if (x == null || y == null) return; this.w = x - this.x; this.h = this.y - y; }
            clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

            getScaledFontSize(screenW, screenH) {
                if (!this.autoScaleText) return this.font_size;
                const scaled = Math.min(screenW * 0.12, screenH * 0.22);
                return Math.round(this.clamp(scaled, this.minFontSize, this.maxFontSize));
            }

            formatTextToFitRectangle(text, rectangleWidth, fontSize, fontName) {
                if (!text) return '';
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                context.font = `${fontSize}px ${fontName}`;
                const paragraphs = String(text).split('\n');
                let result = [];
                for (let paragraph of paragraphs) {
                    const words = paragraph.split(' ');
                    let currentLine = '';
                    for (let word of words) {
                        const testLine = currentLine + word + ' ';
                        if (context.measureText(testLine).width > rectangleWidth && currentLine !== '') {
                            result.push(currentLine.trimEnd());
                            currentLine = word + ' ';
                        } else {
                            currentLine = testLine;
                        }
                    }
                    if (currentLine.trim().length > 0) result.push(currentLine.trimEnd());
                    if (paragraph === '' || words.length === 0) result.push('');
                }
                return result.join('\n');
            }

            fitTextToBox(text, width, height, fontName, startingFontSize) {
                let fontSize = startingFontSize;
                const minSize = this.minFontSize;
                while (fontSize >= minSize) {
                    const fittedText = this.formatTextToFitRectangle(text, width, fontSize, fontName);
                    const lines = fittedText.split('\n');
                    const lineHeight = Math.max(fontSize + 2, 14);
                    if (lines.length * lineHeight <= height * 0.9) return { text: fittedText, fontSize };
                    fontSize -= 1;
                }
                return { text: this.formatTextToFitRectangle(text, width, minSize, fontName), fontSize: minSize };
            }

            drawMultilineText(ctx, text, x, y, width, height, color, fontSize, fontName) {
                if (!ctx || !text) return;
                const lines = String(text).split('\n');
                const lineHeight = Math.max(fontSize + 2, 14);
                const totalTextHeight = lines.length * lineHeight;
                const startY = y + (height - totalTextHeight) / 2;
                ctx.save();
                ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
                ctx.fillStyle = color;
                ctx.font = `${fontSize}px ${fontName}`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineHeight));
                ctx.restore();
            }

            drawPaper(ctx, x, y, w, h) {
                const fold = Math.max(10, Math.min(22, Math.min(w, h) * 0.22));
                // Paper body path — the folded/peeled corner is at the TOP-RIGHT so the
                // note reads right-side up.
                const bodyPath = () => {
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + w - fold, y);
                    ctx.lineTo(x + w, y + fold);
                    ctx.lineTo(x + w, y + h);
                    ctx.lineTo(x, y + h);
                    ctx.closePath();
                };
                ctx.save();
                // soft drop shadow for the whole note
                ctx.shadowColor = 'rgba(20,24,40,0.28)';
                ctx.shadowBlur = 12;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 5;
                bodyPath();
                const g = ctx.createLinearGradient(x, y, x, y + h);
                g.addColorStop(0, this.paper);
                g.addColorStop(1, this.paperEdge);
                ctx.fillStyle = g;
                ctx.fill();
                ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
                // folded corner flap (small darker triangle in the cut at top-right)
                ctx.beginPath();
                ctx.moveTo(x + w - fold, y);
                ctx.lineTo(x + w - fold, y + fold);
                ctx.lineTo(x + w, y + fold);
                ctx.closePath();
                ctx.fillStyle = this.foldColor;
                ctx.fill();
                // selection ring
                if (this.hl) {
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = this.highlightColor;
                    bodyPath();
                    ctx.stroke();
                }
                ctx.restore();
            }

            draw(graph, ctx) {
                if (!graph) return;
                const drawCtx = ctx || (graph.canvas && graph.canvas.getCTX && graph.canvas.getCTX());
                if (!drawCtx) return;

                let screenX = graph.X(this.x);
                let screenY = graph.Y(this.y);
                let screenW = graph.screenWidth(this.w);
                let screenH = graph.screenHeight(this.h);
                if (screenW < 0) { screenX += screenW; screenW = Math.abs(screenW); }
                if (screenH < 0) { screenY += screenH; screenH = Math.abs(screenH); }
                if (screenW < this.displayMinWidth || screenH < this.displayMinHeight) return;

                this.drawPaper(drawCtx, screenX, screenY, screenW, screenH);

                if (this.comment) {
                    const padding = 10;
                    const tw = Math.max(10, screenW - padding * 2);
                    const th = Math.max(10, screenH - padding * 2);
                    const fit = this.fitTextToBox(this.comment, tw, th, this.font, this.getScaledFontSize(screenW, screenH));
                    this.drawMultilineText(drawCtx, fit.text, screenX + padding, screenY + padding, tw, th, this.color, fit.fontSize, this.font);
                }
            }
        }
        resolve(PostItNote);
    })
}
