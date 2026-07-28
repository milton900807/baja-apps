function () {

    return new Promise(async (resolve, reject) => {
        let WellColorPallette = await exec('baja/plate/well-color-palette.js')
        function calculateFontSize(screenWidth, screenHeight, vtext, ctx) {
            let text = vtext;
            if (vtext == typeof 'string') {
                text = vtext.trim()
            } else if (vtext == typeof 'number') {
                text = vtext.toFixed(2) + ''
            }

            let fontSize = 100;
            ctx.font = `${fontSize}px Arial`;

            let textWidth = ctx.measureText(text).width;

            while ((textWidth * 3) > screenWidth || fontSize * 1.5 > screenHeight) {
                fontSize--;
                ctx.font = `${fontSize}px Arial`;
                textWidth = ctx.measureText(text).width;
            }

            return fontSize;
        }

        let GenericWell = class GenericWell {
            name = 'unknown';
            score;
            obj = '';
            concentration;
            wellType;
            select = false;
            structure;
            group;
            color = null;
            value;
            source;
            compoundId;
            idt;
            props;
            dye;
            position;
            properties = {};
            slope
            intercept
            rSquared

            __skin_transient__;

            constructor(name, value, obj, group) {
                this.name = name;
                this.position = name;

                let floatValue = parseFloat(value);
                if (!isNaN(floatValue)) {
                    this.value = floatValue;
                } else {
                    if (value != null && value.length > 0)
                        this.value = value + '';
                    else
                    {
                        value = null;
                    }
                }

                this.obj = obj;
                this.group[group]=obj;
            }
            setColor(color_) {
                this.color = color_
            }
            setGroup(group) {
                this.group[group]=[];
            }
            setConcentration(_concentration) {
                this.concentration = _concentration;
            }
            setObj(obj) {
                this.obj = obj;
            }

            deepCopy() {
                let copiedWell = new GenericWell(this.name, this.value, this.obj, this.group);
                copiedWell.score = this.score;
                copiedWell.concentration = this.concentration;
                copiedWell.wellType = this.wellType;
                copiedWell.select = this.select;
                copiedWell.structure = this.structure;
                copiedWell.color = this.color;
                copiedWell.source = this.source;
                copiedWell.compoundId = this.compoundId;
                copiedWell.idt = this.idt;
                copiedWell.dye = this.dye;
                copiedWell.position = this.position;
                copiedWell.slope = this.slope;
                copiedWell.intercept = this.intercept;
                copiedWell.rSquared = this.rSquared;
                copiedWell.properties = JSON.parse(JSON.stringify(this.properties));
                return copiedWell;
            }

            getObj() {
                return this.obj;
            }

            setGroupName(groupName) {
                this.group[groupName] = []
            }
            draw(graph, grid, ctx, min, max, x, y) {

                if (!ctx) {
                    return;
                }

                let offset = 4;
                ctx.textAlign = 'left';

                ctx.fillStyle = this.group && this.group in WellColorPallette ? WellColorPallette[this.group] : 'rgba(220,220,220,0.3)';
                ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                    graph.screenWidth(grid.screenWidth(1)) - offset * 2, graph.screenHeight(grid.screenHeight(1)) - offset);

                if (well.select) {
                    ctx.fillStyle = 'rgba(255, 165, 0, 0.7)';
                    ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                        graph.screenWidth(grid.screenWidth(1)) - offset, graph.screenHeight(grid.screenHeight(1)) - offset);
                }

                ctx.stroke();
                let wellWidth = graph.screenWidth(grid.screenWidth(1));
                let wellHeight = graph.screenHeight(grid.screenHeight(1));
                let centerX = graph.X(grid.X(x)) + wellWidth / 2;
                let centerY = graph.Y(grid.Y(y)) + wellHeight / 2;

                if (wellWidth < 55) {
                    offset = 1;

                    return;
                } else if (wellWidth < 280) {
                    ctx.font = "8pt Arial";
                    offset = 1;
                    ctx.fillStyle = 'black';

                    if (this.obj) {
                        ctx.fillText(`${this.obj}`, centerX, centerY);
                    }

                    if (this.value != null && this.value != 'undefined') {
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';

                        if (typeof this.value === 'string') {
                            ctx.fillStyle = 'maroon';

                            ctx.fillText('' + this.value + '', centerX, centerY);
                        } else {
                            ctx.fillStyle = 'black';
                            ctx.fillText(parseFloat(this.value).toFixed(2), centerX, centerY);
                        }
                    }

                    ctx.stroke();
                } else {
                    ctx.font = "9pt Arial";
                    ctx.fillStyle = 'magenta';
                    let fontSize = 12
                    if (this.score) {
                        let color = perc2color(this.score, min, max);
                        ctx.fillStyle = color;
                        ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                            graph.screenWidth(grid.screenWidth(1)) - offset, graph.screenHeight(grid.screenHeight(1)));
                        ctx.fillText(this.score.toFixed(2), graph.X(grid.X(x)) + 10, graph.Y(grid.Y(y)) - 15);

                        ctx.stroke();
                    }

                    if (this.value != null && this.value != 'undefined') {
                        ctx.fillStyle = 'maroon';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        if (this.value != null && this.value != NaN) {
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = 'black';

                            fontSize = calculateFontSize(wellWidth, wellHeight, this.value, ctx)
                            ctx.font = `${fontSize}px Arial`

                            if (typeof this.value === 'string') {
                                ctx.fillText(this.value, centerX, centerY);
                            } else {
                                ctx.fillText((this.value).toFixed(2), centerX, centerY);
                            }
                        }
                    }
                    ctx.textAlign = 'left';
                    ctx.font = '9px Arial'
                    ctx.fillStyle = 'black';
                    ctx.fillText(this.name, graph.X(grid.X(x)) + 10, graph.Y(grid.Y(y)) + fontSize);

                    ctx.stroke();

                }
            }

            selectIt() {
                this.select = true;
            }

            deselectIt() {
                this.select = false;
            }

            drawAnnotations(graph, grid, ctx, min, max, x, y) {
                if (!ctx) {
                    return;
                }
                if (this.__skin_transient__) {
                    return this.__skin_transient__(graph, grid, ctx, min, max, x, y, this);
                }

                let offset = 4;
                ctx.textAlign = 'left';

                ctx.fillStyle = this.group && this.group in WellColorPallette ? WellColorPallette[this.group] : 'rgba(20,20,200,0.3)';

                ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                    graph.screenWidth(grid.screenWidth(1)) - offset * 2, graph.screenHeight(grid.screenHeight(1)) - offset);

                if (this.select) {
                    ctx.fillStyle = 'magenta';
                    ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                        graph.screenWidth(grid.screenWidth(1)) - offset, graph.screenHeight(grid.screenHeight(1)) - offset);
                }

                ctx.stroke();

                let wellWidth = graph.screenWidth(grid.screenWidth(1));
                let wellHeight = graph.screenHeight(grid.screenHeight(1));
                let centerX = graph.X(grid.X(x)) + wellWidth / 2;
                let centerY = graph.Y(grid.Y(y)) + wellHeight / 2;

                if (wellWidth < 55) {
                    offset = 1;
                    return;
                } else if (wellWidth < 280) {
                    ctx.font = "8pt Arial";
                    offset = 1;
                    ctx.fillStyle = 'black';

                    if (this.name !== undefined && this.name !== null) {
                        ctx.textAlign = 'left';
                        ctx.fillText(this.name, graph.X(grid.X(x)) + 10, graph.Y(grid.Y(y)) + 10);
                    }

                    if (this.value !== undefined && this.value !== null) {
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = 'black';

                        let displayValue = (typeof this.value === 'string') ? this.value : this.value.toFixed(2);
                        ctx.fillText(displayValue, centerX, centerY);

                        if (this.obj !== undefined && this.obj !== null) {
                            ctx.fillText(this.obj, centerX, centerY + 15);
                        }
                    }
                    ctx.stroke();
                } else {
                    ctx.font = "12pt Arial";
                    ctx.fillStyle = 'white';

                    let rectX = graph.X(grid.X(x)) + offset;
                    let rectY = graph.Y(grid.Y(y)) + offset;
                    let rectWidth = graph.screenWidth(grid.screenWidth(1)) - offset;
                    let rectHeight = graph.screenHeight(grid.screenHeight(1)) - offset;
                    let padding = 10;
                    let verticalSpacing = 20;
                    let textYPosition = rectY + padding;
                    let centerX = rectX + rectWidth / 2;

                    if (this.score !== undefined && this.score !== null) {
                        let color = perc2color(this.score, min, max);
                        ctx.fillStyle = color;
                        ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

                        ctx.fillStyle = 'white';
                        ctx.textAlign = 'center';
                        ctx.fillText(this.score.toFixed(2), centerX, textYPosition);
                        textYPosition += verticalSpacing;

                        ctx.stroke();
                    }

                    if (this.value !== undefined && this.value !== null) {
                        ctx.fillStyle = 'maroon';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        let displayValue = (typeof this.value === 'string') ? this.value : this.value.toFixed(2);

                        ctx.fillText(displayValue, centerX, textYPosition);
                        textYPosition += verticalSpacing;

                        if (this.obj !== undefined && this.obj !== null) {
                            ctx.fillText(this.obj, centerX, textYPosition);
                            textYPosition += verticalSpacing;
                        }
                    }

                    if (this.name !== undefined && this.name !== null) {
                        ctx.textAlign = 'left';
                        ctx.fillStyle = 'black';
                        ctx.fillText(this.name, rectX + padding, textYPosition);
                        textYPosition += verticalSpacing;
                    }

                    if (this.group !== undefined && this.group !== null) {
                        ctx.fillStyle = 'black';
                        ctx.fillText(`Group: ${this.group}`, rectX + padding, textYPosition);
                        textYPosition += verticalSpacing;
                    }

                    ctx.stroke();
                }
            }

        }

        resolve(GenericWell)

    })
}
