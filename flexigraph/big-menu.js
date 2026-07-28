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
                    return {
                        r: parseInt(match[0], 10),
                        g: parseInt(match[1], 10),
                        b: parseInt(match[2], 10)
                    };
                } else {
                    throw new Error("Invalid color format");
                }
            }

            try {
                const { r, g, b } = toRGB(inputColor);
                const luminance = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
                return luminance > 0.5 ? "#111111" : "#FFFFFF";
            } catch (error) {
                console.error("Error processing color:", error);
                return "#111111";
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
            ctx.save();
            ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
            ctx.shadowBlur = radius < 100 ? 10 : 14;
            ctx.shadowOffsetX = 3;
            ctx.shadowOffsetY = 4;
            ctx.lineWidth = 0;

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        function drawRRect(ctx, x, y, width, height) {
            ctx.save();
            ctx.shadowColor = "rgba(0, 0, 0, 0.20)";
            ctx.shadowBlur = 12;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 4;
            ctx.lineWidth = 0;

            ctx.beginPath();
            ctx.rect(x, y, width, height);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        function drawRoundedRect(ctx, x, y, width, height, radius, mt) {
            let color = "rgb(32, 255, 251)";
            if (this.highlight >= 0) {
                color = this.sg;
            }

            if (mt === "xx-small-left") {
                return drawChevronLeft(ctx, x - 5, y, 8, color, "rgba(0,0,0,0.25)", 8, 1, 2);
            } else if (mt === "xx-small-right") {
                return drawChevronRight(ctx, x + 15, y, 8, color, "rgba(0,0,0,0.25)", 8, 1, 2);
            }

            if (width < 70) {
                drawRRect(ctx, x, y, width, height);
                return;
            }

            ctx.save();
            ctx.shadowColor = "rgba(0, 0, 0, 0.18)";
            ctx.shadowBlur = 14;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 5;
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

            ctx.restore();
        }

        function fitLabelText(ctx, text, maxWidth) {
            const original = String(text ?? "");
            if (!original) return "";

            if (ctx.measureText(original).width <= maxWidth) {
                return original;
            }

            let truncated = original;
            const ellipsis = "...";

            while (truncated.length > 0 && ctx.measureText(truncated + ellipsis).width > maxWidth) {
                truncated = truncated.slice(0, -1);
            }

            return truncated.length > 0 ? truncated + ellipsis : ellipsis;
        }

        let Menu = class Menu {
            name;
            x = 0;
            y = 0;
            color = "white";
            list = [];
            mx = -1;
            my = -1;
            highlight = -1;

            mheight = 62;
            xoffset = 0;
            yoffset = 0;
            menu_width = 560;

            title = "";
            sg = "#1F6FEB";
            sf = "#FFFFFF";
            bg = "#F7F9FC";
            fg = "#111827";
            activeitems = [];
            scrollIndex = 0;
            scrollTimer = null;
            columns = 1;
            menu_type = null;
            titleFont = "700 26px Arial";
            titleColor = "#111827";
            isdisplayed = false;

            static removeDuplicateLabels(items) {
                const seenLabels = new Set();
                return items.filter(item => {
                    if (seenLabels.has(item.label)) return false;
                    seenLabels.add(item.label);
                    return true;
                });
            }

            constructor(list, x, y, bg, fg, columns = 1) {
                this.x = x;
                this.y = y;

                const seenLabels = new Set();
                try {
                    this.list = list.filter(item => {
                        if (item && item.label && !seenLabels.has(item.label)) {
                            seenLabels.add(item.label);
                            return true;
                        }
                        return false;
                    });
                } catch (exception) {
                    console.log("exception", exception);
                    this.list = [];
                }

                this.columns = columns > 0 ? columns : 1;
                if (bg) this.bg = bg;
                if (fg) this.fg = fg;
            }

            isIn(graph, xwc, ywc) {
                let xin = graph.X(xwc) + this.xoffset;
                let yin = graph.Y(ywc) + this.yoffset;
                let xot = graph.X(this.x);
                let yot = graph.Y(this.y);

                const columnGap = 22;
                let totalMenuWidth = this.menu_width * this.columns + columnGap * (this.columns - 1);
                let itemsPerColumn = this.getItemsPerColumn();
                let totalMenuHeight = itemsPerColumn * this.mheight;

                if (
                    xin > xot &&
                    xin < (xot + totalMenuWidth) &&
                    yin > yot &&
                    yin < (yot + totalMenuHeight)
                ) {
                    return true;
                }

                this.highlight = -1;
                return false;
            }

            dehighlight() {
                this.highlight = -1;
            }

            async mouseUp(graph, x, y) {
                if (this.y === undefined) return;

                if (this.isIn(graph, x, y)) {
                    const columnGap = 22;
                    let xsc = graph.X(x);
                    let ysc = graph.Y(y);

                    let column = Math.floor((xsc - graph.X(this.x)) / (this.menu_width + columnGap));
                    let diff = Math.abs(graph.Y(this.y) - ysc + 16);
                    let row = Math.floor(diff / this.mheight);
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
                if (this.y === undefined) return;

                if (this.isIn(graph, x, y)) {
                    const columnGap = 22;
                    let xsc = graph.X(x);
                    let ysc = graph.Y(y);

                    let column = Math.floor((xsc - graph.X(this.x)) / (this.menu_width + columnGap));
                    let diff = Math.abs(graph.Y(this.y) - ysc + 16);
                    let row = Math.floor(diff / this.mheight);

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
                }
                return 0;
            }

            getItemsPerColumn() {
                if (!this.columns || this.columns <= 0) {
                    this.columns = 1;
                }
                return Math.ceil(this.list.length / this.columns);
            }

            draw(ctx, grid) {
                if (isMobile() && !this.isdisplayed) {
                    const genegraph_panel_layout = CurrentLayout.getStashed("mainPanel");
                    const graph = CurrentLayout.getStashed("graph");
                    exec("flexigraph/show-mobile-menu.js", 0, 0, this.list, graph, genegraph_panel_layout, "mainPanel");
                    this.isdisplayed = true;
                    return;
                }

                if (!this.list) return;

                const columnGap = 22;
                const outerPadding = 6;
                const buttonRadius = 14;
                const textPaddingX = 18;

                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                let itemsPerColumn = this.getItemsPerColumn();

                if (this.title) {
                    ctx.save();
                    ctx.font = this.titleFont;
                    ctx.fillStyle = this.titleColor;
                    ctx.textAlign = "left";
                    ctx.textBaseline = "middle";
                    ctx.shadowColor = "rgba(0,0,0,0.08)";
                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 2;

                    ctx.fillText(
                        this.title,
                        grid.X(this.x) + this.xoffset + 6,
                        grid.Y(this.y) - 22
                    );

                    ctx.restore();
                }

                for (let i = 0; i < this.list.length; i++) {
                    let column = Math.floor(i / itemsPerColumn);
                    let row = i % itemsPerColumn;
                    let menuItem = this.list[i];
                    let columnXOffset = column * (this.menu_width + columnGap);

                    let x = grid.X(this.x) + this.xoffset + columnXOffset + outerPadding;
                    let y = grid.Y(this.y) + this.yoffset + (row * this.mheight) + outerPadding;
                    let width = this.menu_width - 2 * outerPadding;
                    let height = this.mheight - 2 * outerPadding;

                    let itemBg = this.bg;
                    if (menuItem && menuItem.bg) itemBg = menuItem.bg;
                    if (this.highlight === i) itemBg = this.sg;

                    ctx.fillStyle = itemBg;
                    drawRoundedRect.call(this, ctx, x, y, width, height, buttonRadius, this.menu_type);

                    ctx.save();
                    ctx.strokeStyle = this.highlight === i ? "rgba(255,255,255,0.18)" : "rgba(17,24,39,0.08)";
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(x + buttonRadius, y);
                    ctx.lineTo(x + width - buttonRadius, y);
                    ctx.quadraticCurveTo(x + width, y, x + width, y + buttonRadius);
                    ctx.lineTo(x + width, y + height - buttonRadius);
                    ctx.quadraticCurveTo(x + width, y + height, x + width - buttonRadius, y + height);
                    ctx.lineTo(x + buttonRadius, y + height);
                    ctx.quadraticCurveTo(x, y + height, x, y + height - buttonRadius);
                    ctx.lineTo(x, y + buttonRadius);
                    ctx.quadraticCurveTo(x, y, x + buttonRadius, y);
                    ctx.closePath();
                    ctx.stroke();
                    ctx.restore();

                    let textColor = this.fg || getContrastColor(itemBg, ctx);
                    if (menuItem && menuItem.fg) textColor = menuItem.fg;
                    if (this.highlight === i) textColor = this.sf || getContrastColor(itemBg, ctx);

                    ctx.save();
                    ctx.font = "600 20px Arial";
                    ctx.fillStyle = textColor;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";

                    const label = menuItem && menuItem.label ? String(menuItem.label) : "";
                    const textToDisplay = fitLabelText(ctx, label, width - textPaddingX * 2);

                    ctx.fillText(
                        textToDisplay,
                        x + width / 2,
                        y + height / 2
                    );

                    ctx.restore();
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
                        click: item.click ? "[Function]" : null
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
        };

        resolve(Menu);
    });
}
