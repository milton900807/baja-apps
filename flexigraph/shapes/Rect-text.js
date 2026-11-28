function () {
    return new Promise(async (resolve, reject) => {
        let RectangleText = class RectangleText {
            name;
            x;
            y;
            w = 1;
            h = 1;

            // Ink rather than pure black: #000 on a pale canvas reads as a hole punched in
            // it, which is why no printed figure uses it for body text.
            color = '#132033';
            rectColor = 'lightGreen';
            highlightColor = 'red';

            comment = '';
            type = 'RectangleText';

            // A LABEL ON A FIGURE, NOT A CAPTION ON A SNAPSHOT. These are read beside the
            // data and screenshotted into slides and reports, so the typography is the
            // product: the UI stack rather than bare Arial, a line height that is not the
            // font size plus two, and ink rather than pure black, which on a pale canvas
            // reads as a hole.
            font = '-apple-system, BlinkMacSystemFont, Segoe UI, Inter, Helvetica, Arial, sans-serif';
            lineHeightFactor = 1.35;
            padding = 11;
            cornerRadius = 7;
            // Prose reads left-aligned; a one-line label reads centered. 'auto' does that,
            // and 'left' or 'center' override it.
            align = 'auto';
            // A BOX THAT CANNOT HOLD ITS TEXT GROWS. It used to shrink the text to
            // minFontSize and then draw it anyway, straight through the bottom border: the
            // one outcome nobody would choose, since the box is the thing that can give.
            autoGrow = true;

            font_size = 18;
            minFontSize = 10;
            maxFontSize = 48;
            autoScaleText = true;

            showRect = true;
            hl = false;
            backgroundColor = null;          // fill behind the text (null = no fill; keeps old look)
            borderWhenSelectedOnly = false;  // when true, the border draws only while selected/hl

            lineWidth = 2;
            displayMinWidth = 10;
            displayMinHeight = 10;

            shadow = {
                blur: 4,
                color: 'rgba(0,0,0,0.20)',
                offsetX: 2,
                offsetY: 2
            };

            constructor(name, x, y) {
                this.name = name;
                this.x = x;
                this.y = y;
            }

            setColor(color) {
                if (color != null) {
                    this.color = color;
                }
            }

            setRectColor(color) {
                if (color != null) {
                    this.rectColor = color;
                }
            }

            setFont(font, size) {
                if (font != null) {
                    this.font = font;
                }
                if (size != null) {
                    this.font_size = size;
                }
            }

            setText(text) {
                this.comment = text ?? '';
            }

            highlight(v) {
                this.hl = !!v;
            }

            move(x, y) {
                if (x == null || y == null) return;
                this.x = x;
                this.y = y;
            }

            isIn(x, y) {
                const minX = Math.min(this.x, this.x + this.w);
                const maxX = Math.max(this.x, this.x + this.w);
                const minY = Math.min(this.y, this.y - this.h);
                const maxY = Math.max(this.y, this.y - this.h);

                const inside = x >= minX && x <= maxX && y >= minY && y <= maxY;
                this.hl = inside;
                return inside;
            }

            update(x, y) {
                if (x == null || y == null) return;

                this.w = x - this.x;
                this.h = this.y - y;
            }

            clamp(value, min, max) {
                return Math.max(min, Math.min(max, value));
            }

            getScaledFontSize(screenW, screenH) {
                if (!this.autoScaleText) {
                    return this.font_size;
                }

                const widthBased = screenW * 0.12;
                const heightBased = screenH * 0.22;

                const scaled = Math.min(widthBased, heightBased);

                return Math.round(
                    this.clamp(scaled, this.minFontSize, this.maxFontSize)
                );
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
                        const testWidth = context.measureText(testLine).width;

                        if (testWidth > rectangleWidth && currentLine !== '') {
                            result.push(currentLine.trimEnd());
                            currentLine = word + ' ';
                        } else {
                            currentLine = testLine;
                        }
                    }

                    if (currentLine.trim().length > 0) {
                        result.push(currentLine.trimEnd());
                    }

                    if (paragraph === '' || words.length === 0) {
                        result.push('');
                    }
                }

                return result.join('\n');
            }

            fitTextToBox(text, width, height, fontName, startingFontSize) {
                let fontSize = startingFontSize;
                let fittedText = '';
                const minSize = this.minFontSize;
                const maxTextHeightFactor = 0.9;

                while (fontSize >= minSize) {
                    fittedText = this.formatTextToFitRectangle(text, width, fontSize, fontName);
                    const lines = fittedText.split('\n');
                    const lineHeight = this.lineHeight(fontSize);
                    const totalTextHeight = lines.length * lineHeight;

                    if (totalTextHeight <= height * maxTextHeightFactor) {
                        return {
                            text: fittedText,
                            fontSize: fontSize
                        };
                    }

                    fontSize -= 1;
                }

                return {
                    text: this.formatTextToFitRectangle(text, width, minSize, fontName),
                    fontSize: minSize
                };
            }

            lineHeight(fontSize) {
                return Math.max(Math.round(fontSize * (this.lineHeightFactor || 1.35)), 12);
            }

            // What the text needs, at a size, in a width: the height the box has to be.
            textHeightAt(text, width, fontSize) {
                const t = this.formatTextToFitRectangle(text, width, fontSize, this.font);
                return String(t).split('\n').length * this.lineHeight(fontSize);
            }

            roundRectPath(ctx, x, y, w, h, r) {
                const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
                ctx.beginPath();
                if (typeof ctx.roundRect === 'function') { ctx.roundRect(x, y, w, h, rr); return; }
                ctx.moveTo(x + rr, y);
                ctx.lineTo(x + w - rr, y);
                ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
                ctx.lineTo(x + w, y + h - rr);
                ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
                ctx.lineTo(x + rr, y + h);
                ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
                ctx.lineTo(x, y + rr);
                ctx.quadraticCurveTo(x, y, x + rr, y);
                ctx.closePath();
            }

            applyShadow(ctx) {
                if (!ctx) return;
                ctx.shadowBlur = this.shadow.blur ?? 4;
                ctx.shadowColor = this.shadow.color ?? 'rgba(0,0,0,0.20)';
                ctx.shadowOffsetX = this.shadow.offsetX ?? 2;
                ctx.shadowOffsetY = this.shadow.offsetY ?? 2;
            }

            clearShadow(ctx) {
                if (!ctx) return;
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }

            drawRectShape(ctx, x, y, w, h, color, lineWidth = 2) {
                if (!ctx) return;

                ctx.save();
                this.applyShadow(ctx);
                // A HAIRLINE LANDS ON A PIXEL, NOT ACROSS TWO. An odd-width stroke on a
                // whole coordinate is painted half in each neighbouring pixel, which is
                // what makes a thin border look furry rather than thin.
                const half = (lineWidth % 2) ? 0.5 : 0;
                this.roundRectPath(ctx, Math.round(x) + half, Math.round(y) + half,
                    Math.round(w), Math.round(h), this.cornerRadius);
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = color;
                ctx.stroke();

                ctx.restore();
            }

            drawMultilineText(ctx, text, x, y, width, height, color, fontSize, fontName) {
                if (!ctx || !text) return;

                const lines = String(text).split('\n');
                const lineHeight = this.lineHeight(fontSize);
                const totalTextHeight = lines.length * lineHeight;

                // CENTERED IS FOR A LABEL, LEFT IS FOR A SENTENCE. Every line centered
                // gives a ragged edge on both sides, which is why a centered paragraph
                // reads as a poster and not as a note: the eye has to find the start of
                // each line. One line has no such edge, so it centers.
                const mode = (this.align && this.align !== 'auto')
                    ? this.align : (lines.length > 1 ? 'left' : 'center');
                const startY = Math.round(y + Math.max(0, (height - totalTextHeight) / 2));

                ctx.save();
                this.clearShadow(ctx);

                ctx.fillStyle = color;
                ctx.font = `${fontSize}px ${fontName}`;
                ctx.textAlign = mode === 'center' ? 'center' : 'left';
                ctx.textBaseline = 'top';
                const tx = Math.round(mode === 'center' ? (x + width / 2) : x);

                // A LABEL WITH NO BOX STILL HAS TO BE READ, and what is behind it is a
                // track, an arc or a dashed guide. A halo the colour of the paper is what
                // a map does with a place name over a contour.
                const halo = this.showRect ? null
                    : (this.textHalo === false ? null : (this.textHaloColor || 'rgba(255,255,255,0.85)'));
                if (halo) {
                    ctx.lineJoin = 'round';
                    ctx.miterLimit = 2;
                    ctx.lineWidth = Math.max(2, Math.round(fontSize / 5));
                    ctx.strokeStyle = halo;
                    lines.forEach((line, i) => {
                        ctx.strokeText(line, tx, startY + i * lineHeight);
                    });
                }

                lines.forEach((line, i) => {
                    ctx.fillText(line, tx, startY + i * lineHeight);
                });

                ctx.restore();
            }

            draw(graph, ctx) {
                if (!graph) return;

                const drawCtx = ctx || graph.canvas?.getCTX();
                if (!drawCtx) return;

                let screenX = graph.X(this.x);
                let screenY = graph.Y(this.y);
                let screenW = graph.screenWidth(this.w);
                let screenH = graph.screenHeight(this.h);

                if (screenW < 0) {
                    screenX += screenW;
                    screenW = Math.abs(screenW);
                }

                if (screenH < 0) {
                    screenY += screenH;
                    screenH = Math.abs(screenH);
                }

                if (
                    screenW < this.displayMinWidth ||
                    screenH < this.displayMinHeight
                ) {
                    return;
                }

                const borderColor = this.hl ? this.highlightColor : this.rectColor;

                // ---- THE BOX GIVES, NOT THE TEXT ---------------------------------------
                // The old order was: shrink the text until it fits, and if it still does
                // not fit at the smallest readable size, draw it anyway. That is how a
                // sentence ends up running through the bottom border of its own box.
                //
                // A BOX THAT OVERFLOWS TELLS YOU WHICH ONE WAS CHOSEN FOR THE OTHER. Nobody
                // writes a sentence to fit a rectangle they drew; they drag a rectangle and
                // then write. So when the text does not fit, the text is the fixed thing:
                // it is set at the label's own font size (or whatever the WIDTH allows, if
                // that is smaller) and the box grows to hold it. A box with room to spare
                // is left exactly as it was, which keeps every banner and caption that fits
                // today looking identical.
                //
                // The size used to grow by must not itself depend on the height, or the
                // taller box yields a larger font, which needs a taller box: a label that
                // creeps larger on every frame for as long as the canvas is open.
                let forcedSize = null;
                if (this.autoGrow && this.comment && screenW > this.displayMinWidth) {
                    try {
                        const pad = this.padding;
                        const innerW = Math.max(10, screenW - pad * 2);
                        const asItStands = this.getScaledFontSize(screenW, screenH);
                        if (this.textHeightAt(this.comment, innerW, asItStands) + pad * 2 > screenH) {
                            forcedSize = this.autoScaleText
                                ? this.clamp(Math.min(Math.round(screenW * 0.12), this.font_size),
                                    this.minFontSize, this.maxFontSize)
                                : this.font_size;
                            const needs = this.textHeightAt(this.comment, innerW, forcedSize) + pad * 2;
                            if (needs > screenH) {
                                const grownBy = needs - screenH;
                                screenH = needs;
                                // The MODEL grows too, or the box is drawn at one size and
                                // selected, dragged and saved at another -- a label you
                                // cannot grab by the border you can see.
                                try {
                                    const perWorld = graph.screenHeight(1);
                                    const worldH = perWorld ? (grownBy / perWorld) : 0;
                                    if (isFinite(worldH) && worldH) {
                                        this.h = this.h + (this.h < 0 ? -Math.abs(worldH) : Math.abs(worldH));
                                    }
                                } catch (e) { }
                            }
                        }
                    } catch (e) { }
                }

                if (this.showRect) {
                    // Background fill (dark banner etc.) behind the text.
                    //
                    // A BOXED LABEL GETS ONE EVEN WHEN NOBODY SET IT. These sit over exon
                    // bands, dashed guides and arcs, and text drawn straight onto that is
                    // not a label anybody can read -- in the shot that started this, a
                    // sentence crossed two pink guides and the track body. A near-opaque
                    // paper behind it costs nothing and is what every annotation on a
                    // figure has. An UNBOXED label (showRect false) is left transparent on
                    // purpose and gets a halo instead, below.
                    const fill = this.backgroundColor
                        || (this.defaultPaper === false ? null : 'rgba(255,255,255,0.94)');
                    if (fill) {
                        drawCtx.save();
                        this.applyShadow(drawCtx);
                        this.roundRectPath(drawCtx, Math.round(screenX), Math.round(screenY),
                            Math.round(screenW), Math.round(screenH), this.cornerRadius);
                        drawCtx.fillStyle = fill;
                        drawCtx.fill();
                        drawCtx.restore();
                    }
                    // Border: always, or only while selected/highlighted when requested.
                    if (this.hl || !this.borderWhenSelectedOnly) {
                        this.drawRectShape(
                            drawCtx,
                            screenX,
                            screenY,
                            screenW,
                            screenH,
                            borderColor,
                            this.hl ? this.lineWidth + 1 : this.lineWidth
                        );
                    }
                }

                if (this.comment) {
                    const padding = this.padding;
                    const textBoxWidth = Math.max(10, screenW - padding * 2);
                    const textBoxHeight = Math.max(10, screenH - padding * 2);

                    // The same size the box was grown for, so the two cannot disagree.
                    const startingFontSize = forcedSize != null
                        ? forcedSize : this.getScaledFontSize(screenW, screenH);

                    const fit = this.fitTextToBox(
                        this.comment,
                        textBoxWidth,
                        textBoxHeight,
                        this.font,
                        startingFontSize
                    );

                    this.drawMultilineText(
                        drawCtx,
                        fit.text,
                        screenX + padding,
                        screenY + padding,
                        textBoxWidth,
                        textBoxHeight,
                        this.color,
                        fit.fontSize,
                        this.font
                    );
                }
            }
        }

        resolve(RectangleText);
    })
}
