function () {
    return new Promise(async (resolve, reject) => {

        function drawRoundedRect(ctx, x, y, width, height, radius) {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
        }

        let Menu = class Menu {
            name;
            x = 0;
            y = 0;
            color = 'black';
            list = [];
            mx = -1;
            my = -1;
            highlight = -1;
            mheight = 30;
            xoffset = 0;
            yoffset = 0;
            menu_width = 250;
            title = '';
            sg = '#eef2f8';
            sf = '#1d4ed8';
            bg = 'rgba(255,255,255,0.98)';
            fg = '#344054';
            activeitems = [];
            scrollIndex = 0;
            scrollTimer = null;
            column_spacing = 20;

            constructor(list, x, y, bg, fg) {
                this.x = x;
                this.y = y;
                this.list = list;
                if (bg) this.bg = bg;
                if (fg) this.fg = fg;
                if (isMobile()) {
                    this.mheight = 30;
                    this.x = 0;
                    this.y = 0;
                }
            }

            draw(ctx, grid, graph) {
                ctx.textAlign = 'left';

                let itemsPerColumn = Math.floor(graph.screenWidth(grid.height) / graph.screenHeight(this.mheight));
                let column = 0;
                let row = 0;

                let xStart = graph.X(grid.X(this.x));
                let yStart = graph.Y(grid.Y(this.y));

                for (let i = 0; i < this.list.length; i++) {
                    if (row >= itemsPerColumn) {
                        column++;
                        row = 0;
                    }

                    let xPos = xStart + (column * (graph.screenWidth((this.menu_width)) + graph.screenWidth((this.column_spacing))));
                    let yPos = yStart + (row * graph.screenHeight(this.mheight));

                    if ((xPos + graph.screenWidth(this.menu_width)) > graph.screenWidth(grid.width)) {
                        column = 0;
                        row = 0;
                        xPos = xStart;
                        yPos = yStart + (row * graph.screenHeight(this.mheight));
                        row++;
                    }

                    ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    ctx.shadowBlur = 12;
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                    if (this.highlight === i) {
                        ctx.fillStyle = this.sg;
                    } else {
                        ctx.fillStyle = this.bg;
                    }

                    drawRoundedRect(ctx, (xPos), (yPos), (this.menu_width),  (this.mheight), 8);
                    ctx.fill();

                    ctx.font = "11px Arial";
                    ctx.fillStyle = this.fg;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(this.list[i].label, graph.X(xPos + this.mheight / 2), graph.Y(yPos) + graph.screenWidth(this.mheight / 2));
                    ctx.stroke();

                    row++;
                }
            }

            getVisibleItemCount(grid) {
                let availableHeight = grid.height - grid.Y(this.y) - 15;
                return Math.min(this.list.length, Math.floor(availableHeight / this.mheight));
            }
        }

        resolve(Menu)
    })
}
