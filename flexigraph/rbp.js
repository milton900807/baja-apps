function () {
    return new Promise(async (resolve, reject) => {

        let rbp = class rbp {
            name;
            x;
            y;
            w = 1;
            h = 1;
            color = 'black';
            comment = '';
            type = 'rbp';
            font = "Arial";
            font_size = '20px';
            showRect = true;
            hl = false;

            constructor(name, x, y) {
                this.name = name;
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

            update(x, y) {
                this.w = x - this.x;
                this.h = this.y - y;
            }
            async draw(graph) {

                let screen_height = graph.screenHeight(this.h);
                let screen_width = graph.screenWidth(this.w);
                if ( screen_height < 10 || screen_width < 10 ){
                    return;
                }

                if (this.hl) {
                    graph.drawRect(graph.X(this.x), graph.Y(this.y), screen_width, screen_height, 'red', 1);

                }

                if (this.showRect)
                    graph.drawRect(graph.X(this.x), graph.Y(this.y), graph.screenWidth(this.w), graph.screenHeight(this.h), 'lightGray', 2);
                if (this.comment) {
                    graph.drawString(this.comment, this.x, this.y - this.h / 2, this.color, this.font_size + ' ' + this.font);
                }
            }
        }
        resolve( rbp )
    })
}
