function () {
    return new Promise(async (resolve, reject) => {

        let RectangleText = class RectangleText {
            name;
            x;
            y;
            w = 1;
            h = 1;
            color = 'black';
            comment = '';
            type = 'RectangleText';
            font = "Arial";
            font_size = '20px';
            showRect = true;
            hl = false;

            constructor(name, x, y) {
                this.x = x;
                this.y = y;
            }
            setColor(color) {
                this.color = color;
            }
            highlight(v) {
                this.hl = v;
            }
            move(x, y) {
                if (!x || !y) {
                    return;
                }
                this.x = x;
                this.y = y;
            }
            setColor(color) {
                this.color = color;
            }

            isIn(x, y) {
                if (x >= this.x && x < (this.x + this.w) &&
                    y < this.y && y > this.y - this.h) {
                    this.hl = true;
                    return true;
                }
                this.hl = false;
                return false;
            }

            formatTextToFitRectangle(text, rectangleWidth, fontSize, fontName) {
                if ( !text ){
                    return;
                }
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                context.font = `${fontSize}px ${fontName}`;

                let words = text.split(' ');
                let formattedText = '';
                let currentLine = '';

                for (let word of words) {
                    let testLine = currentLine + word + ' ';
                    let metrics = context.measureText(testLine);
                    let testWidth = metrics.width;

                    if (testWidth > rectangleWidth && currentLine !== '') {
                        formattedText += currentLine + '\n';
                        currentLine = word + ' ';
                    } else {
                        currentLine = testLine;
                    }
                }

                formattedText += currentLine;

                return formattedText;
            }

            update(x, y) {
                this.w = x - this.x;
                this.h = this.y - y;
            }
            async draw(graph) {
                let screen_height = graph.screenHeight(this.h);
                let screen_width = graph.screenWidth(this.w);
                if (screen_height < 10 || screen_width < 10) {
                    return;
                }
                if (this.hl) {
                    graph.drawRect(graph.X(this.x), graph.Y(this.y), screen_width, screen_height, 'red', 1);
                }
                let t = this.formatTextToFitRectangle(this.comment, screen_width, this.font_size, this.font)
                if (this.showRect)
                    graph.drawRect(graph.X(this.x), graph.Y(this.y), graph.screenWidth(this.w), graph.screenHeight(this.h), 'lightGreen', 3);
                if (this.comment) {
                    graph.drawTextInRectangle(t, this.x, this.y, screen_width, this.font_size, this.font, this.color)
                }
            }
        }
        resolve(RectangleText)
    })
}
