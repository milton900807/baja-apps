function () {

    let tl = class HObj {
        canvas;
        x;
        y;
        w;
        h;
        s;
        grid;

        constructor(x, y, w, h, s) {
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
            this.s = s;
        }
        draw(ctx, graph) {
            this.canvas = graph.graph.canvas;
            this.grid = graph.graph;
            if (!this.canvas) {
                this.canvas = graph.canvas;
            }
            if (ctx && this.s && this.s.length > 0) {
                this.thinDashedRect(graph.X(this.x), graph.Y(this.y), graph.screenWidth(this.w), graph.screenHeight(this.h), 'lightGray')
                this.drawTextInRectangle(this.s, graph.X(this.x), graph.Y(this.y), 100, 11, 'Helvetica', 'blue')
            }
        }

        drawTextInRectangle(text, x, y, rectangleWidth, fontSize, fontName, color) {
            if (this.canvas) {
                fontSize = parseInt(fontSize)
                var context = this.canvas.getCTX();
                context.font = `${fontSize}px ${fontName}`;
                context.fillStyle = color;
                let words = text.split(' ');
                let currentLine = '';
                y = y + fontSize;
                words.forEach(word => {
                    let testLine = currentLine + word + ' ';
                    let metrics = context.measureText(testLine);
                    let testWidth = metrics.width;
                    if (testWidth > rectangleWidth && currentLine !== '') {
                        context.fillText(currentLine, x, y);
                        currentLine = word + ' ';
                        y += fontSize;
                    } else {
                        currentLine = testLine;
                    }
                });
                context.fillText(currentLine, x, y);
            }
        }

        thinDashedRect = (x, y, w, h, color) => {
            if (this.canvas) {
                var ctx = this.canvas.getCTX();
                if (!color) {
                    color = 'black'
                }
                ctx.lineWidth = "2";
                ctx.strokeStyle = color;
                ctx.fillStyle = color;
                ctx.setLineDash([5, 15]);
                ctx.beginPath();
                ctx.rect(x, y, w, h);
                ctx.stroke();
                ctx.setLineDash([]);

            }

        }
    }
    return tl;
}
