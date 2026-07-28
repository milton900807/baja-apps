function () {
    return new Promise(async (resolve, reject) => {

        function getContrastColor(inputColor, context) {

            function toRGB(color) {

                context.fillStyle = color;
                const rgb = context.fillStyle;

                if (/^#[0-9A-F]{6}$/i.test(rgb)) {
                    const bigint = parseInt(rgb.slice(1), 16);
                    return {
                        r: (bigint >> 16) & 255,
                        g: (bigint >> 8) & 255,
                        b: bigint & 255
                    };
                } else if (rgb.startsWith("rgb")) {
                    const match = rgb.match(/\d+/g);
                    return { r: parseInt(match[0]), g: parseInt(match[1]), b: parseInt(match[2]) };
                } else {
                    throw new Error("Invalid color format");
                }
            }
            try {
                const { r, g, b } = toRGB(inputColor);

                const luminance = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);

                return luminance > 0.5 ? '#000000' : '#FFFFFF';
            } catch (error) {
                console.error("Error processing color:", error);
                return '#000000';
            }
        }
        function drawChevronRight(ctx, x, y, size, color, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY) {
            ctx.save();

            ctx.shadowColor = shadowColor;
            ctx.shadowBlur = shadowBlur;
            ctx.shadowOffsetX = shadowOffsetX;
            ctx.shadowOffsetY = shadowOffsetY;

            ctx.fillStyle = color;

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - size, y - size);
            ctx.lineTo(x - size, y - size / 2);
            ctx.lineTo(x - 2 * size, y - size / 2);
            ctx.lineTo(x - 2 * size, y + size / 2);
            ctx.lineTo(x - size, y + size / 2);
            ctx.lineTo(x - size, y + size);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }
        function drawChevronLeft(ctx, x, y, size, color, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY) {

            ctx.save();

            ctx.shadowColor = shadowColor;
            ctx.shadowBlur = shadowBlur;
            ctx.shadowOffsetX = shadowOffsetX;
            ctx.shadowOffsetY = shadowOffsetY;

            ctx.fillStyle = color;

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + size, y - size);
            ctx.lineTo(x + size, y - size / 2);
            ctx.lineTo(x + 2 * size, y - size / 2);
            ctx.lineTo(x + 2 * size, y + size / 2);
            ctx.lineTo(x + size, y + size / 2);
            ctx.lineTo(x + size, y + size);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        function drawCircle(ctx, x, y, radius) {

            if (radius < 100) {

                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 5;
                ctx.shadowOffsetY = 5;
                ctx.lineWidth = 0;

                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.closePath();
                ctx.fill();

                ctx.shadowColor = 'transparent';

                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.lineWidth = 1;
            } else {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 5;
                ctx.shadowOffsetY = 5;
                ctx.lineWidth = 0;

                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.closePath();
                ctx.fill();

                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.lineWidth = 1;
            }
        }

        function drawRoundedRect(ctx, x, y, width, height, radius, mt) {
            let color = 'rgb(32, 255, 251)'
            if (this.highlight >= 0) {
                color = this.sg;
            }

            if (mt === 'xx-small-left') {
                return drawChevronLeft(ctx, x - 5, y, 8, color, 'rgba(0, 0, 0, 0.5)', 10, 5, 5);
            } else if (mt === 'xx-small-right') {
                return drawChevronRight(ctx, x + 15, y, 8, color, 'rgba(0, 0, 0, 0.5)', 10, 5, 5);

            }

            if (width < 70) {
                drawRRect(ctx, x, y, width, height);
            } else {
                ctx.shadowColor = 'rgba(10, 10, 10, 0.6)';
                ctx.shadowBlur = 15;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                ctx.lineWidth = 0;

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
                ctx.fill();
                ctx.shadowColor = 'transparent';

                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.lineWidth = 1;
            }

        }
        function drawRRect(ctx, x, y, width, height) {

            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 5;
            ctx.shadowOffsetY = 5;
            ctx.lineWidth = 0;

            ctx.beginPath();
            ctx.rect(x, y, width, height);
            ctx.closePath();
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.lineWidth = 1;
        }

        let Menu = class Menu {
            name;
            x = 0;
            y = 0;
            color = 'white';
            list = []
            mx = -1;
            my = -1;
            highlight = -1;
            mheight = 35;
            xoffset = 0;
            yoffset = 0;
            menu_width = 250;
            title = ''
            sg = 'cyan'
            sf = 'blue'
            bg = 'rgb(205, 255, 155)'
            fg = 'black'
            activeitems = []
            scrollIndex = 0;
            scrollTimer = null;
            columns = 1;
            menu_type = null;
            titleFont = '21px Arial'
            titleColor = 'Black'
            isdisplayed = false;

            static removeDuplicateLabels(items) {
                const seenLabels = new Set();
                return items.filter(item => {
                    if (seenLabels.has(item.label)) {
                        return false;
                    }
                    seenLabels.add(item.label);
                    return true;
                });
            }

            constructor(list, x, y, bg, fg, columns = 1) {
                this.x = x;
                this.y = y;

                const seenLabels = new Set();
                this.list = list.filter(item => {
                    if (item && item.label && !seenLabels.has(item.label)) {
                        seenLabels.add(item.label);
                        return true;
                    }
                    return false;
                });

                this.columns = columns;
                if (bg) this.bg = bg;
                if (fg) this.fg = fg;

            }
            isIn(graph, xwc, ywc) {
                let xin = graph.X(xwc) + this.xoffset;
                let yin = graph.Y(ywc) + this.yoffset;
                let xot = graph.X(this.x);
                let yot = graph.Y(this.y);

                let totalMenuWidth = this.menu_width * this.columns + 20 * (this.columns - 1);
                let itemsPerColumn = this.getItemsPerColumn();

                let totalMenuHeight = itemsPerColumn * this.mheight;

                if (xin > xot && xin < (xot + totalMenuWidth) &&
                    yin > yot && yin < (yot + totalMenuHeight)) {
                    return true;
                }
                this.highlight = -1;
                return false;
            }
            dehighlight() {
                this.highlight = -1;
            }
            async mouseUp(graph, x, y) {
                if (this.y === undefined) {
                    return;
                }
                if (this.isIn(graph, x, y)) {
                    let xsc = graph.X(x);
                    let ysc = graph.Y(y);

                    let column = Math.floor((xsc - graph.X(this.x)) / (this.menu_width + 20));
                    let diff = Math.abs(graph.Y(this.y) - ysc + 16);
                    let row = Math.round(diff / this.mheight);
                    let itemsPerColumn = this.getItemsPerColumn();
                    this.highlight = column * itemsPerColumn + row + this.scrollIndex;
                    if (this.highlight < this.list.length) {
                        if (this.list[this.highlight] && this.list[this.highlight].click) {
                            return await this.list[this.highlight].click(x, y);
                        }
                    }
                }

            }
            mouseMove(graph, x, y) {
                if (this.y === undefined) {
                    return;
                }

                if (this.isIn(graph, x, y)) {
                    let xsc = graph.X(x);
                    let ysc = graph.Y(y);

                    let column = Math.floor((xsc - graph.X(this.x)) / (this.menu_width + 20));

                    let diff = Math.abs(graph.Y(this.y) - ysc + 16);
                    let row = Math.round(diff / this.mheight);

                    let itemsPerColumn = this.getItemsPerColumn();
                    this.highlight = column * itemsPerColumn + row + this.scrollIndex;

                    if (this.highlight >= this.list.length) {
                        this.highlight = -1;
                    }
                } else {
                    this.highlight = -1;
                    this.stopScrolling();
                }
            }
            startScrolling(visibleItemCount) {
                this.scrollTimer = setInterval(() => {
                    this.scrollIndex = Math.min(this.scrollIndex + 1, this.list.length - visibleItemCount);
                }, 1000);
            }
            stopScrolling() {
                if (this.scrollTimer) {
                    clearInterval(this.scrollTimer);
                    this.scrollTimer = null;
                }
            }
            getVisibleItemCount(grid) {
                if (grid.height) {
                    let availableHeight = grid.height - grid.Y(this.y) - 15;
                    return Math.min(this.list.length, Math.floor(availableHeight / this.mheight));
                } else if (grid.canvas) {
                    let availableHeight = grid.canvas.height - grid.Y(this.y) - 15;
                    return Math.min(this.list.length, Math.floor(availableHeight / this.mheight));
                } else {
                    return 0;
                }
            }
            getItemsPerColumn() {
                if (!this.columns || this.columns <= 0) {
                    this.columns = 1;
                }
                return Math.ceil(this.list.length / this.columns);
            }

            draw(ctx, grid) {

                if (isMobile() && !this.isdisplayed) {
                    const genegraph_panel_layout = CurrentLayout.getStashed('mainPanel')
                    const graph = CurrentLayout.getStashed('graph')

                    exec('flexigraph/show-mobile-menu.js', 0, 0, this.list, graph, genegraph_panel_layout, 'mainPanel')
                    this.isdisplayed = true;
                    return;
                }

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                if (!this.list) return;

                let itemsPerColumn = this.getItemsPerColumn();
                ctx.font = '14px Arial';
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                let radius = 8;
                let borderPadding = 4;

                if (this.title) {
                    ctx.font = this.titleFont;
                    ctx.fillStyle = this.titleColor;
                    ctx.strokeStyle = this.titleColor;
                    ctx.fillText(
                        this.title,
                        grid.X(this.x) + this.xoffset + this.menu_width / 2,
                        grid.Y(this.y) + borderPadding - 10
                    );
                    ctx.shadowBlur = 0;
                }

                for (let i = 0; i < this.list.length; i++) {
                    let column = Math.floor(i / itemsPerColumn);
                    let row = i % itemsPerColumn;
                    let menuItem = this.list[i];
                    let columnXOffset = column * (this.menu_width + 20);

                    let x = grid.X(this.x) + this.xoffset + columnXOffset + borderPadding;
                    let y = grid.Y(this.y) + this.yoffset + (row * this.mheight) + borderPadding;
                    let width = this.menu_width - 2 * borderPadding;
                    let height = this.mheight - 2 * borderPadding;

                    ctx.fillStyle = this.bg;
                    if (this.highlight === i) {
                        ctx.fillStyle = this.sg;
                    } else if (menuItem.bg) {
                        ctx.fillStyle = menuItem.bg;
                    }

                    if (menuItem.sg) {
                        ctx.fillStyle = menuItem.sg;
                    }

                    drawRoundedRect(ctx, x, y, width, height, radius, this.menu_type);

                    ctx.font = "14px Arial";
                    ctx.fillStyle = this.fg;
                    if (this.highlight === i) {
                        ctx.fillStyle = this.sf;
                    } else if (menuItem.fg) {
                        ctx.fillStyle = menuItem.fg;
                    }

                    if (!this.fg) {
                        this.fg = getContrastColor(this.bg);
                    }

                    if (menuItem.label) {
                        let textToDisplay = menuItem.label;
                        let availableWidth = width - 10;

                        while (ctx.measureText(textToDisplay + '...').width > availableWidth) {
                            textToDisplay = textToDisplay.slice(0, -1);
                        }

                        if (textToDisplay !== menuItem.label) {
                            textToDisplay += '...';
                        }

                        ctx.fillText(
                            textToDisplay,
                            x + width / 2,
                            y + height / 2
                        );
                    }

                    ctx.strokeStyle = 'transparent';
                }
            }

            toJSON() {
                return {
                    name: this.name,
                    x: this.x,
                    y: this.y,
                    color: this.color,
                    list: this.list.map(item => ({
                        label: item.label,
                        click: item.click ? '[Function]' : null
                    })),
                    mx: this.mx,
                    my: this.my,
                    highlight: this.highlight,
                    mheight: this.mheight,
                    xoffset: this.xoffset,
                    yoffset: this.yoffset,
                    menu_width: this.menu_width,
                    title: this.title,
                    sg: this.sg,
                    sf: this.sf,
                    bg: this.bg,
                    fg: this.fg,
                    activeitems: this.activeitems,
                    scrollIndex: this.scrollIndex,
                    columns: this.columns,
                    menu_type: this.menu_type
                };
            }

        }

        resolve(Menu)
    })
}
