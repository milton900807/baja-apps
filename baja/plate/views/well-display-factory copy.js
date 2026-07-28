function () {

    return new Promise(async (resolve, reject) => {
        let WellColorPallette = await exec('baja/plate/well-color-palette.js')
        let Icon = await exec('flexigraph/shapes/icon.js')

        const drawInputFieldWithRedBorder = (ctx, x, y, width, height, radius, well) => {
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

            ctx.fillStyle = well.select ? "#FF7F7F" : 'white';

            ctx.fill();

            ctx.strokeStyle = 'red';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        };

        function generateRandomRGBAColor() {
            const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
            const randomFloat = (min, max) => (Math.random() * (max - min) + min).toFixed(2);

            const red = randomInt(0, 255);
            const green = randomInt(0, 255);
            const blue = randomInt(0, 255);
            const alpha = randomFloat(0.2, 0.8);

            return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
        }

        const drawInputField = (ctx, x, y, width, height, radius, well) => {
            const isSelected = well.select;

            ctx.fillStyle = isSelected ? '#d7fbe5' : (well.color || '#f9f9f9');
            ctx.strokeStyle = isSelected ? '#00cc99' : 'blue';

            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.shadowBlur = 0;

            drawRoundedRect(ctx, x, y, width, height, radius);
            ctx.fill();
            ctx.stroke();
        };

        const createDisplayWithUnit = (unitLabel = '', options = {}) => {
            return (graph, grid, ctx, min, max, x, y, well) => {
                const safeNumber = (v, fallback = 0) => typeof v === 'number' && !isNaN(v) ? v : fallback;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;
                let fontSize = 11 * scaleFactor;
                if (fontSize < 9) fontSize = 11;

                ctx.fillStyle = well.select ? 'magenta' : 'white';
                ctx.strokeStyle = 'transparent';
                ctx.lineWidth = 0;
                ctx.shadowBlur = 0;

                const cornerRadius = 4 * scaleFactor;
                drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius);
                ctx.fill();

                let raw = parseFloat((well.value || "").toString().replace(/[^\d.-]/g, ''));
                if (isNaN(raw)) raw = 0;

                let formatted = raw % 1 === 0 ? raw.toFixed(0) : raw.toFixed(2);

                if (options.abbreviate) {
                    const abs = Math.abs(raw);
                    if (abs >= 1e12) formatted = (raw / 1e12).toFixed(2) + 'T';
                    else if (abs >= 1e9) formatted = (raw / 1e9).toFixed(2) + 'B';
                    else if (abs >= 1e6) formatted = (raw / 1e6).toFixed(2) + 'M';
                    else if (abs >= 1e3) formatted = (raw / 1e3).toFixed(2) + 'K';
                }

                let text = formatted + (unitLabel ? ` ${unitLabel}` : '');

                ctx.font = `${fontSize}pt Arial`;
                ctx.fillStyle = '#003300';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                ctx.fillText(text, screen_x + screen_width / 2, screen_y + screen_height / 2);
            };
        };

        const createInputWithUnit = (unitLabel = '', options = {}) => {
            return (graph, grid, ctx, min, max, x, y, well) => {
                let cellPadding = 6;
                const safeNumber = (v, fallback = 0) => typeof v === 'number' && !isNaN(v) ? v : fallback;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;
                let fontSize = 11 * scaleFactor;
                if (fontSize < 9) fontSize = 11;

                const cornerRadius = 4 * scaleFactor;
                drawInputField(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius, well);

                let raw = parseFloat((well.value || "").toString().replace(/[^\d.-]/g, ''));
                if (isNaN(raw)) raw = 0;

                let formatted = raw.toFixed(2);
                if (options.abbreviate) {
                    const abs = Math.abs(raw);
                    if (abs >= 1e12) formatted = (raw / 1e12).toFixed(2) + 'T';
                    else if (abs >= 1e9) formatted = (raw / 1e9).toFixed(2) + 'B';
                    else if (abs >= 1e6) formatted = (raw / 1e6).toFixed(2) + 'M';
                    else if (abs >= 1e3) formatted = (raw / 1e3).toFixed(2) + 'K';
                }

                let text = formatted + (unitLabel ? ` ${unitLabel}` : '');

                ctx.font = `${fontSize}pt Arial`;
                ctx.fillStyle = well.fgcolor || 'black';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                const maxTextWidth = screen_width - 2 * cellPadding;
                while (ctx.measureText(text + '...').width > maxTextWidth && text.length > 0) {
                    text = text.slice(0, -1);
                }
                if (ctx.measureText(text).width > maxTextWidth) text += "...";

                ctx.fillText(text, screen_x + cellPadding, screen_y + screen_height / 2);
            };
        };

        const truncateTextCached = (() => {
            const cache = new Map();

            return function (text, maxWidth, ctx) {
                const cacheKey = `${ctx.font}_${text}_${maxWidth}`;
                if (cache.has(cacheKey)) {
                    return cache.get(cacheKey);
                }

                let truncated = text;

                if (ctx.measureText(text).width <= maxWidth) {
                    cache.set(cacheKey, truncated);
                    return truncated;
                }

                while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxWidth) {
                    truncated = truncated.slice(0, -1);
                }

                truncated += '…';
                cache.set(cacheKey, truncated);
                return truncated;
            };
        })();

        function drawRoundedRect(ctx, x, y, width, height, radius) {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.arcTo(x + width, y, x + width, y + radius, radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
            ctx.lineTo(x + radius, y + height);
            ctx.arcTo(x, y + height, x, y + height - radius, radius);
            ctx.lineTo(x, y + radius);
            ctx.arcTo(x, y, x + radius, y, radius);
            ctx.closePath();
        }

        function calculateFontSize(screenWidth, screenHeight, text, ctx) {
            if (typeof text === 'number') {
                text = text.toFixed(2);
            } else if (typeof text === 'string') {
                text = text.trim();
            }
            let fontSize = 20;
            ctx.font = `${fontSize}px Arial`;
            let textWidth = ctx.measureText(text).width;
            while (textWidth > screenWidth * 0.9 || fontSize > screenHeight * 0.9) {
                fontSize--;
                ctx.font = `${fontSize}px Arial`;
                textWidth = ctx.measureText(text).width;
            }
            return fontSize;
        }

        function truncateTextToFit(text, screenWidth, ctx) {
            let textWidth = ctx.measureText(text).width;
            let ellipsis = '...';

            if (textWidth > screenWidth) {
                while (ctx.measureText(text + ellipsis).width > screenWidth) {
                    text = text.slice(0, -1);
                }
                return text + ellipsis;
            }
            return text;
        }

        const truncateText = (text, maxWidth, ctx) => {
            let safeText = text || '';
            let truncated = safeText;
            while (ctx.measureText(truncated).width > maxWidth && truncated.length > 0) {
                truncated = truncated.slice(0, -1);
            }
            return truncated + (truncated.length < safeText.length ? '...' : '');
        };

        let t = {
            'Address': (graph, grid, ctx, min, max, x, y, well) => {
                if (!ctx || well.name == null) {
                    return;
                }
                let offset = 4;
                ctx.textAlign = 'left';

                ctx.fillStyle = well.group && well.group in WellColorPallette ? WellColorPallette[well.group] : 'rgba(220,220,220,0.3)';

                ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                    graph.screenWidth(grid.screenWidth(1)) - offset * 2, graph.screenHeight(grid.screenHeight(1)) - offset);
                ctx.stroke();

                if (well.select) {
                    ctx.fillStyle = 'rgba(255, 165, 0, 0.7)';
                    ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                        graph.screenWidth(grid.screenWidth(1)) - offset, graph.screenHeight(grid.screenHeight(1)) - offset);
                    ctx.stroke();
                }

                let wellWidth = graph.screenWidth(grid.screenWidth(1));
                let wellHeight = graph.screenHeight(grid.screenHeight(1));
                let centerX = graph.X(grid.X(x)) + wellWidth / 2;
                let centerY = graph.Y(grid.Y(y)) + wellHeight / 2;

                ctx.textAlign = 'right';
                ctx.font = '17px Arial';
                ctx.fillStyle = 'darkGray';

                if (well.value != null) {
                    ctx.font = "11pt Arial";
                    ctx.fillStyle = 'darkGray';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    let valueY = centerY;
                    if (typeof well.value === 'string') {
                        ctx.fillText(`${well.value}`, centerX, valueY - 20);
                    } else {
                        ctx.fillText(parseFloat(well.value).toFixed(2), centerX, valueY);
                    }
                }

                if (wellWidth < 55) {
                    offset = 1;
                    return;
                } else if (wellWidth < 280) {
                    ctx.font = "8pt Arial";
                    offset = 1;
                    ctx.fillStyle = 'black';

                    if (well.position != null) {
                        ctx.font = "8pt Arial";
                        ctx.fillStyle = 'black';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        let valueY = centerY + 10;
                        ctx.fillStyle = 'orange ';
                        ctx.fillText(`${well.position}`, centerX, valueY);
                    }
                    ctx.stroke();
                } else {
                    ctx.font = "9pt Arial";
                    ctx.fillStyle = 'magenta';
                    let fontSize = 12;

                    if (well.score) {
                        let color = perc2color(well.score, min, max);
                        ctx.fillStyle = color;
                        ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                            graph.screenWidth(grid.screenWidth(1)) - offset, graph.screenHeight(grid.screenHeight(1)));
                        ctx.fillText(well.score.toFixed(2), graph.X(grid.X(x)) + 10, graph.Y(grid.Y(y)) - 15);
                        ctx.stroke();
                    }

                    if (well.group) {
                        ctx.font = '9px Arial';
                        ctx.fillStyle = 'gray';
                        ctx.textAlign = 'center';
                        ctx.fillText(`${well.group}`, centerX, centerY - 30);
                    }

                    if (well.obj) {
                        ctx.font = "bold 16pt Arial";
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(well.obj, centerX, centerY);
                    }

                    if (well.value != null) {
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = 'maroon';

                        fontSize = calculateFontSize(wellWidth, wellHeight, well.value, ctx);
                        ctx.font = `${fontSize}px Arial`;

                        let valueY = centerY + 20;
                        if (typeof well.position === 'string') {
                            ctx.fillText(well.position, centerX, valueY);
                        } else {
                            ctx.fillText((well.position).toFixed(2), centerX, valueY);
                        }
                    }

                    ctx.textAlign = 'left';
                    ctx.font = '9px Arial';
                    ctx.fillStyle = 'black';
                    ctx.fillText(well.position, graph.X(grid.X(x)) + 10, graph.Y(grid.Y(y)) + wellHeight - 10);

                    ctx.stroke();
                }
            },
            'SummaryAmount': (graph, grid, ctx, min, max, x, y, well) => {
                if (!ctx || well.name == null) return;

                let offset = 0;
                const wellWidth = well.__screen_width;
                const wellHeight = well.__screen_height;

                if (wellHeight < 5 || wellWidth < 10) return;

                const posX = graph.X(grid.X(x)) + offset;
                const posY = graph.Y(grid.Y(y)) + offset;
                const padding = 3;
                const textX = posX + padding;
                const centerY = posY + wellHeight / 2;

                const scaleFactor = Math.min(wellWidth, wellHeight) / 20;
                let fontSize = Math.max(7, 8 * scaleFactor);
                ctx.font = `${fontSize}pt Arial`;
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";

                ctx.fillStyle = well.group && WellColorPallette[well.group]
                    ? WellColorPallette[well.group]
                    : "rgba(244, 239, 255, 0.17)";
                ctx.fillRect(posX, posY, wellWidth, wellHeight);
                ctx.stroke();

                if (well.select) {
                    ctx.fillStyle = "rgba(26, 23, 75, 0.7)";
                    ctx.fillRect(posX, posY, wellWidth, wellHeight);
                    ctx.stroke();
                }

                ctx.save();
                ctx.beginPath();
                ctx.rect(posX, posY, wellWidth, wellHeight);
                ctx.clip();

                if (well.value != null) {
                    ctx.fillStyle = "black";

                    let displayValue;
                    if (typeof well.value === "string") {
                        displayValue = well.value;
                    } else {
                        const value = parseFloat(well.value);
                        if (value >= 1_000_000_000) {
                            displayValue = `$${(value / 1_000_000_000).toFixed(2)}B`;
                        } else if (value >= 1_000_000) {
                            displayValue = `$${(value / 1_000_000).toFixed(2)}M`;
                        } else if (value >= 1_000) {
                            displayValue = `$${(value / 1_000).toFixed(0)}K`;
                        } else {
                            displayValue = `$${value.toFixed(2)}`;
                        }
                    }

                    const words = displayValue.split(" ");
                    let lines = [];
                    let currentLine = words[0];

                    for (let i = 1; i < words.length; i++) {
                        let testLine = currentLine + " " + words[i];
                        let textWidth = ctx.measureText(testLine).width;
                        if (textWidth < wellWidth - padding * 2) {
                            currentLine = testLine;
                        } else {
                            lines.push(currentLine);
                            currentLine = words[i];
                        }
                    }
                    lines.push(currentLine);

                    const textHeight = lines.length * fontSize;
                    let textY = centerY - textHeight / 2 + fontSize / 2;
                    lines.forEach(line => {
                        ctx.fillText(line, textX, textY);
                        textY += fontSize;
                    });
                }

                ctx.restore();

                if (wellWidth < 55) {
                    offset = 1;
                } else {
                    ctx.fillStyle = "black";
                    ctx.stroke();
                }
            },

            'ColumnHeader': (graph, grid, ctx, min, max, x, y, well) => {
                if (!ctx || well.name == null) return;
                ctx.strokeStyle = 'transparent';

                let offset = 0;
                const wellWidth = well.__screen_width;
                const wellHeight = well.__screen_height;

                if (wellHeight < 5 || wellWidth < 10) return;

                const posX = graph.X(grid.X(x)) + offset;
                const posY = graph.Y(grid.Y(y)) + offset;
                const centerX = posX + wellWidth / 2;
                const centerY = posY + wellHeight / 2;

                const scaleFactor = Math.min(wellWidth, wellHeight) / 20;
                let fontSize = Math.max(7, 8 * scaleFactor);
                ctx.font = `${fontSize}pt Arial`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                ctx.fillStyle = well.group && WellColorPallette["ColumnHeader"]
                    ? WellColorPallette["ColumnHeader"]
                    : "rgba(170, 211, 232, 1)";
                ctx.fillRect(posX, posY, wellWidth, wellHeight);
                ctx.stroke();

                if (well.select) {
                    ctx.fillStyle = "rgba(95, 191, 255, 0.7)";
                    ctx.fillRect(posX, posY, wellWidth, wellHeight);
                    ctx.stroke();
                }

                ctx.save();
                ctx.beginPath();
                ctx.rect(posX, posY, wellWidth, wellHeight);
                ctx.clip();

                if (well.value != null) {
                    ctx.fillStyle = "rgba(0, 0, 0, 1)";
                    let displayValue;

                    if (typeof well.value === "string") {
                        displayValue = well.value;
                    } else {
                        let num = parseFloat(well.value);
                        displayValue = (num % 1 === 0) ? num.toFixed(0) : num.toFixed(2);
                    }

                    let truncated = displayValue;
                    const maxWidth = wellWidth - 6;

                    if (ctx.measureText(truncated).width > maxWidth) {
                        while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
                            truncated = truncated.slice(0, -1);
                        }
                        truncated += '...';
                    }

                    ctx.fillText(truncated, centerX, centerY);
                }

                ctx.restore();

                if (wellWidth < 55) {
                    offset = 1;
                } else {
                    ctx.fillStyle = "black";
                    ctx.stroke();
                }
            },
            'Background_cells': (graph, grid, ctx, min, max, x, y, well) => {
                if (!ctx || well.name == null) return;

                let offset = 0;
                const wellWidth = well.__screen_width;
                const wellHeight = well.__screen_height;

                if (wellHeight < 5 || wellWidth < 10) return;

                const posX = graph.X(grid.X(x)) + offset;
                const posY = graph.Y(grid.Y(y)) + offset;
                const centerX = posX + wellWidth / 2;
                const centerY = posY + wellHeight / 2;

                const scaleFactor = Math.min(wellWidth, wellHeight) / 20;
                let fontSize = Math.max(7, 8 * scaleFactor);

                const bgColor = (well.group && WellColorPallette[well.group])
                    ? WellColorPallette[well.group]
                    : "rgba(96, 96, 96, 0.15)";
                ctx.fillStyle = bgColor;
                ctx.fillRect(posX, posY, wellWidth, wellHeight);
                ctx.stroke();

                if (well.select) {
                    ctx.fillStyle = "rgba(255, 165, 0, 0.35)";
                    ctx.fillRect(posX, posY, wellWidth, wellHeight);
                    ctx.stroke();
                }

                ctx.save();
                ctx.beginPath();
                ctx.rect(posX, posY, wellWidth, wellHeight);
                ctx.clip();

                if (well.value != null) {

                    let displayValue;
                    if (typeof well.value === "string") {
                        displayValue = well.value;
                    } else {
                        const num = parseFloat(well.value);
                        displayValue = (num % 1 === 0) ? num.toFixed(0) : num.toFixed(2);
                    }

                    ctx.font = `${fontSize}pt Arial`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";

                    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
                    ctx.globalAlpha = 1;

                    const maxWidth = wellWidth - 6;
                    let truncated = displayValue;
                    if (ctx.measureText(truncated).width > maxWidth) {
                        while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
                            truncated = truncated.slice(0, -1);
                        }
                        truncated += '...';
                    }

                    ctx.fillText(truncated, centerX, centerY);
                }

                ctx.restore();

                ctx.save();
                ctx.lineWidth = 1;
                ctx.strokeStyle = "rgba(0,0,0,0.2)";
                ctx.strokeRect(posX + 0.5, posY + 0.5, wellWidth - 1, wellHeight - 1);
                ctx.restore();

                if (wellWidth < 55) {
                    offset = 1;
                } else {
                    ctx.fillStyle = "black";
                    ctx.stroke();
                }
            },

            'WebLink': (graph, grid, ctx, min, max, x, y, well) => {
                if (!ctx || well.name == null) return;

                let offset = 0;
                const wellWidth = graph.screenWidth(grid.screenWidth(1));
                const wellHeight = graph.screenHeight(grid.screenHeight(1));

                if (wellHeight < 5 || wellWidth < 10) return;

                const posX = graph.X(grid.X(x)) + offset;
                const posY = graph.Y(grid.Y(y)) + offset;
                const centerX = posX + wellWidth / 2;
                const centerY = posY + wellHeight / 2;

                const scaleFactor = Math.min(wellWidth, wellHeight) / 20;
                let fontSize = Math.max(7, 8 * scaleFactor);
                ctx.font = `${fontSize}pt Arial`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                ctx.fillStyle = well.group && WellColorPallette[well.group]
                    ? WellColorPallette[well.group]
                    : "rgba(220,220,220,0.3)";
                ctx.fillRect(posX, posY, wellWidth - offset * 2, wellHeight - offset);
                ctx.stroke();

                if (well.select) {
                    ctx.fillStyle = "hsla(254, 100.00%, 51.40%, 0.70)";
                    ctx.fillRect(posX, posY, wellWidth - offset, wellHeight - offset);
                    ctx.stroke();
                }

                if (well.value != null) {
                    ctx.fillStyle = "black";
                    let displayValue = typeof well.value === "string"
                        ? well.value
                        : parseFloat(well.value).toFixed(2);

                    let truncated = displayValue;
                    const maxWidth = wellWidth - 16;

                    if (ctx.measureText(truncated).width > maxWidth) {
                        while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
                            truncated = truncated.slice(0, -1);
                        }
                        truncated += '...';
                    }

                    ctx.fillText(truncated, centerX, centerY);
                }

                if (wellWidth < 55) {
                    offset = 1;
                } else {
                    ctx.fillStyle = "black";
                    ctx.stroke();
                }

                if (well.obj) {
                    ctx.fillStyle = "blue";
                    const iconFontSize = Math.floor(wellHeight * 0.8);
                    ctx.font = `${iconFontSize}px Arial`;
                    ctx.textAlign = "right";
                    ctx.textBaseline = "top";
                    const iconX = posX + wellWidth - 4;
                    const iconY = posY + (wellHeight - iconFontSize) / 2;
                    ctx.fillText("↗", iconX, iconY);
                }
            },
            'VideoLink': (graph, grid, ctx, min, max, x, y, well) => {
                if (!ctx || well.name == null) return;

                let offset = 0;
                const wellWidth = graph.screenWidth(grid.screenWidth(1));
                const wellHeight = graph.screenHeight(grid.screenHeight(1));

                if (wellHeight < 5 || wellWidth < 10) return;

                const posX = graph.X(grid.X(x)) + offset;
                const posY = graph.Y(grid.Y(y)) + offset;
                const centerX = posX + wellWidth / 2;
                const centerY = posY + wellHeight / 2;

                const scaleFactor = Math.min(wellWidth, wellHeight) / 20;
                let fontSize = Math.max(7, 8 * scaleFactor);
                ctx.font = `${fontSize}pt Arial`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                ctx.fillStyle = well.group && WellColorPallette[well.group]
                    ? WellColorPallette[well.group]
                    : "rgba(220,220,220,0.3)";
                ctx.fillRect(posX, posY, wellWidth - offset * 2, wellHeight - offset);
                ctx.stroke();

                if (well.select) {
                    ctx.fillStyle = "hsla(254, 100.00%, 51.40%, 0.70)";
                    ctx.fillRect(posX, posY, wellWidth - offset, wellHeight - offset);
                    ctx.stroke();
                }

                if (well.value != null) {
                    ctx.fillStyle = "black";
                    let displayValue = typeof well.value === "string"
                        ? well.value
                        : parseFloat(well.value).toFixed(2);

                    let truncated = displayValue;
                    const maxWidth = wellWidth - 16;

                    if (ctx.measureText(truncated).width > maxWidth) {
                        while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
                            truncated = truncated.slice(0, -1);
                        }
                        truncated += '...';
                    }

                    ctx.fillText(truncated, centerX, centerY);
                }

                if (wellWidth < 55) {
                    offset = 1;
                } else {
                    ctx.fillStyle = "black";
                    ctx.stroke();
                }

                if (well.obj) {
                    const iconSize = Math.min(wellWidth, wellHeight) * 0.5;
                    const iconX = posX + wellWidth - iconSize - 2;
                    const iconY = posY + (wellHeight - iconSize) / 2;

                    ctx.fillStyle = "red";
                    ctx.beginPath();
                    ctx.roundRect(iconX, iconY, iconSize, iconSize, 3);
                    ctx.fill();

                    ctx.fillStyle = "white";
                    const triangleSize = iconSize * 0.5;
                    const triX = iconX + iconSize / 2.2;
                    const triY = iconY + iconSize / 2;
                    ctx.beginPath();
                    ctx.moveTo(triX - triangleSize / 2, triY - triangleSize / 1.5);
                    ctx.lineTo(triX + triangleSize / 2, triY);
                    ctx.lineTo(triX - triangleSize / 2, triY + triangleSize / 1.5);
                    ctx.closePath();
                    ctx.fill();
                }
            },

            SIMPLE_TEXT: (graph, grid, ctx, min, max, x, y, well) => {

                const safeNumber = (value, fallback = 0) =>
                    typeof value === 'number' && !isNaN(value) ? value : fallback;

                const screen_x = safeNumber(graph.X(grid.X(well.x)));
                const screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                const screen_width = safeNumber(well.__screen_width, 30);
                const screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;

                let fontSize = 10 * scaleFactor;
                if (fontSize < 9) fontSize = 11;
                const MIN_FONT = 8;

                const PADDING = Math.max(4, Math.round(6 * scaleFactor));

                const contentX = screen_x + PADDING;
                const contentY = screen_y + PADDING;
                const contentW = Math.max(0, screen_width - 2 * PADDING);
                const contentH = Math.max(0, screen_height - 2 * PADDING);

                ctx.font = `${fontSize}pt Arial`;
                ctx.fillStyle = well.select ? 'magenta' : (well.color || 'white');
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                ctx.shadowBlur = 0;
                ctx.shadowColor = "rgba(40, 0, 0, 0.7)";

                const cornerRadius = 5 * scaleFactor;
                drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius);
                ctx.fill();
                ctx.stroke();

                if (well.icon) {
                    if (!well.icon.draw) {
                        well.icon = Icon.buildFromJSON(well.icon);
                    }
                    if (well.icon) {

                        well.icon.x = grid.X(x);
                        well.icon.y = grid.Y(y);
                        well.icon.w = graph.worldWidth(contentW);
                        well.icon.h = graph.worldHeight(contentH);
                        well.icon.draw(graph, ctx);
                    }
                }

                const LINE_HEIGHT_MULT = 1.2;
                function wrapForFontSize(fSize, text, maxWidth, maxHeight) {
                    ctx.font = `${fSize}pt Arial`;
                    const lineHeight = fSize * LINE_HEIGHT_MULT;
                    const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));

                    const words = (text || '').split(' ');
                    const lines = [];
                    let line = "";

                    for (let i = 0; i < words.length; i++) {
                        const tryLine = line ? (line + " " + words[i]) : words[i];
                        if (ctx.measureText(tryLine).width > maxWidth && line) {
                            lines.push(line);
                            line = words[i];
                            if (lines.length >= maxLines) break;
                        } else {
                            line = tryLine;
                        }
                    }
                    if (line && lines.length < maxLines) lines.push(line);

                    const totalH = lines.length * lineHeight;
                    let fitsHeight = totalH <= maxHeight + 0.0001;

                    let fitsWidth = true;
                    for (let i = 0; i < lines.length; i++) {
                        if (ctx.measureText(lines[i]).width > maxWidth) { fitsWidth = false; break; }
                    }

                    return { lines, lineHeight, fits: (fitsHeight && fitsWidth), maxLines };
                }

                if (contentH > 0 && contentW > 0) {

                    let text = typeof well.value === 'string'
                        ? well.value
                        : (well.value != null ? String(well.value) : '');

                    if (well.group && (well.group['dollar'] || well.group['$'])) {
                        text = '$' + new Intl.NumberFormat('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }).format(parseFloat(text));
                    }

                    let wrapped = wrapForFontSize(fontSize, text, contentW, contentH);
                    let guard = 0;
                    while (!wrapped.fits && fontSize > MIN_FONT && guard < 64) {
                        fontSize -= 1;
                        wrapped = wrapForFontSize(fontSize, text, contentW, contentH);
                        guard++;
                    }

                    let { lines, lineHeight, maxLines } = wrapped;
                    if (!wrapped.fits) {
                        if (lines.length > maxLines) lines = lines.slice(0, maxLines);

                        if (lines.length) {
                            let last = lines[lines.length - 1] || '';
                            while (last.length > 0 && ctx.measureText(last + '…').width > contentW) {
                                last = last.slice(0, -1);
                            }
                            lines[lines.length - 1] = last + (last ? '…' : '');
                        }
                    }

                    ctx.font = `${fontSize}pt Arial`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = well.fgcolor || 'black';
                    ctx.shadowBlur = 0;

                    const totalTextHeight = lines.length * lineHeight;
                    const startY = contentY + (contentH - totalTextHeight) / 2 + lineHeight / 2;
                    const leftX = contentX;

                    for (let i = 0; i < lines.length; i++) {
                        ctx.fillText(lines[i], leftX, startY + i * lineHeight);
                    }
                }
            }
            ,

            EXCEL_STYLE_TEXT: (graph, grid, ctx, min, max, x, y, well) => {
                let cellPadding = 4;

                const obj_string = well.obj;

                const safeNumber = (obj_string, fallback = 0) =>
                    typeof obj_string === 'number' && !isNaN(obj_string) ? obj_string : fallback;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;
                let fontSize = 11 * scaleFactor;
                if (fontSize < 9) fontSize = 11;

                ctx.font = `${fontSize}pt "Courier New", monospace`;
                ctx.fillStyle = well.select ? '#0c745f' : (well.color || 'white');
                ctx.strokeStyle = "rgba(150, 150, 150, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                ctx.shadowBlur = 0;
                ctx.shadowColor = "rgba(0, 0, 0, 0.2)";

                const cornerRadius = 3 * scaleFactor;
                drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius);
                ctx.fill();
                ctx.stroke();

                let centerY = screen_y + screen_height / 2;

                if (screen_height >= fontSize) {
                    ctx.font = `${fontSize}pt "Courier New", monospace`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = well.fgcolor || 'black';
                    ctx.shadowBlur = 0;

                    let text = well.obj;
                    if (typeof text !== 'string') {
                        text = text != null ? String(text) : '';
                    }

                    if (!text.startsWith('=') && !well.noFormulaPrefix) {
                        text = '=' + text;
                    }

                    const maxTextWidth = screen_width - 2 * cellPadding;
                    while (ctx.measureText(text).width > maxTextWidth && text.length > 0) {
                        text = text.slice(0, -1);
                    }

                    const leftX = screen_x + cellPadding;
                    ctx.fillText(text, leftX, centerY);
                }
            },

            Input_Number: (graph, grid, ctx, min, max, x, y, well) => {
                const safeNumber = (v, f = 0) => typeof v === 'number' && !isNaN(v) ? v : f;
                const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
                const cellPadding = 6;
                const inset = 2;

                const arrowDepthPct = 0.10;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const h = screen_height;
                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;
                const cornerRadius = clamp(h * 0.12, 3, 12);

                drawInputFieldWithRedBorder(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius, well);

                (function drawPunchyArrow() {
                    const shaftLen = clamp(h * 0.85, 14, 54);
                    const headSize = clamp(h * 0.55, 10, 30);
                    const thickness = clamp(h * 0.28, 3, 14);
                    const innerPad = clamp(h * 0.12, 3, 12);

                    const tipX = clamp(
                        screen_x + screen_width * arrowDepthPct,
                        screen_x + innerPad + headSize,
                        screen_x + screen_width - innerPad - headSize
                    );
                    const tipY = screen_y + h / 2;

                    const shaftEndX = tipX - headSize;
                    const startX = Math.max(screen_x + innerPad, shaftEndX - shaftLen);
                    const startY = tipY;
                    const halfT = thickness / 2;

                    const pathShaft = () => {
                        ctx.beginPath();
                        ctx.moveTo(startX, startY - halfT);
                        ctx.lineTo(shaftEndX, startY - halfT);
                        ctx.arc(shaftEndX, startY, halfT, -Math.PI / 2, Math.PI / 2);
                        ctx.lineTo(startX, startY + halfT);
                        ctx.arc(startX, startY, halfT, Math.PI / 2, -Math.PI / 2, true);
                        ctx.closePath();
                    };
                    const pathHead = () => {
                        ctx.beginPath();
                        ctx.moveTo(tipX, tipY);
                        ctx.lineTo(shaftEndX, tipY - headSize * 0.7);
                        ctx.lineTo(shaftEndX, tipY + headSize * 0.7);
                        ctx.closePath();
                    };

                    ctx.save();
                    ctx.shadowColor = 'rgba(0,0,0,0.55)';
                    ctx.shadowBlur = clamp(h * 0.22, 4, 16);
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = clamp(h * 0.08, 1, 8);
                    ctx.fillStyle = '#FFE769';
                    pathShaft(); ctx.fill();
                    pathHead(); ctx.fill();
                    ctx.restore();

                    ctx.save();
                    ctx.fillStyle = '#8cff00ff';
                    ctx.strokeStyle = '#0b0904ff';
                    ctx.lineWidth = clamp(thickness * 0.33, 1.5, 3);
                    pathShaft(); ctx.fill(); ctx.stroke();
                    pathHead(); ctx.fill(); ctx.stroke();

                    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                    ctx.lineWidth = clamp(thickness * 0.18, 1, 2);
                    ctx.beginPath();
                    ctx.moveTo(tipX - headSize * 0.15, tipY - headSize * 0.58);
                    ctx.lineTo(tipX, tipY);
                    ctx.lineTo(tipX - headSize * 0.15, tipY + headSize * 0.58);
                    ctx.stroke();
                    ctx.restore();
                })();

                const abbreviate = (value) => {
                    const abs = Math.abs(value);
                    if (abs >= 1e12) return (value / 1e12).toFixed(2) + 'T';
                    if (abs >= 1e9) return (value / 1e9).toFixed(2) + 'B';
                    if (abs >= 1e6) return (value / 1e6).toFixed(2) + 'M';
                    if (abs >= 1e3) return (value / 1e3).toFixed(2) + 'K';
                    return value.toFixed(2);
                };

                let raw = parseFloat((well.value || "").toString().replace(/[^\d.-]/g, ''));
                if (isNaN(raw)) raw = 0;
                let text = abbreviate(raw);

                const fontSize = Math.max(11 * scaleFactor, 9);
                ctx.font = `${fontSize}pt Arial`;
                ctx.fillStyle = well.fgcolor || 'black';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                const maxTextWidth = screen_width - 2 * (cellPadding + inset);
                while (ctx.measureText(text + '...').width > maxTextWidth && text.length > 0) text = text.slice(0, -1);
                if (ctx.measureText(text).width > maxTextWidth) text += "...";

                ctx.fillText(text, screen_x + cellPadding + inset, screen_y + screen_height / 2);
            },

            Input_Number: (graph, grid, ctx, min, max, x, y, well) => {
                let cellPadding = 6;
                const safeNumber = (v, fallback = 0) => typeof v === 'number' && !isNaN(v) ? v : fallback;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;
                let fontSize = 11 * scaleFactor;
                if (fontSize < 9) fontSize = 11;

                const cornerRadius = 4 * scaleFactor;
                drawInputField(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius, well);

                const abbreviateNumber = (value) => {
                    const abs = Math.abs(value);
                    if (abs >= 1e12) return (value / 1e12).toFixed(2) + 'T';
                    if (abs >= 1e9) return (value / 1e9).toFixed(2) + 'B';
                    if (abs >= 1e6) return (value / 1e6).toFixed(2) + 'M';
                    if (abs >= 1e3) return (value / 1e3).toFixed(2) + 'K';
                    return value.toFixed(2);
                };

                let raw = parseFloat((well.value || "").toString().replace(/[^\d.-]/g, ''));
                if (isNaN(raw)) raw = 0;
                let text = abbreviateNumber(raw);

                ctx.font = `${fontSize}pt Arial`;
                ctx.fillStyle = well.fgcolor || 'black';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                const maxTextWidth = screen_width - 2 * cellPadding;
                while (ctx.measureText(text + '...').width > maxTextWidth && text.length > 0) {
                    text = text.slice(0, -1);
                }
                if (ctx.measureText(text).width > maxTextWidth) text += "...";

                ctx.fillText(text, screen_x + cellPadding, screen_y + screen_height / 2);
            }

            ,

            TITLE: (graph, grid, ctx, min, max, x, y, well) => {
                let cellPadding = 4;

                const safeNumber = (value, fallback = 0) => (typeof value === 'number' && !isNaN(value) ? value : fallback);

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;

                ctx.fillStyle = well.select ? 'magenta' : (well.color || 'white');
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                ctx.shadowBlur = 0;
                ctx.shadowColor = "rgba(40, 0, 0, 0.7)";

                const cornerRadius = 5 * scaleFactor;

                ctx.fill();
                ctx.stroke();

                if (well.icon) {
                    if (!well.icon.draw) {
                        well.icon = Icon.buildFromJSON(well.icon);
                    }
                    if (well.icon) {
                        well.icon.x = grid.X(x);
                        well.icon.y = grid.Y(y);
                        well.icon.w = graph.worldWidth(screen_width);
                        well.icon.h = graph.worldHeight(screen_height);
                        well.icon.draw(graph, ctx);
                    }
                }

                let text = typeof well.value === 'string' ? well.value : (well.value != null ? String(well.value) : '');
                if (!text) return;

                let fontSize = screen_height;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = well.fgcolor || 'black';
                ctx.shadowBlur = 0;

                while (fontSize > 6) {
                    ctx.font = `bold ${fontSize}px Arial`;
                    let metrics = ctx.measureText(text);
                    let textWidth = metrics.width;
                    let textHeight = fontSize;
                    if (textWidth <= screen_width - 2 * cellPadding && textHeight <= screen_height - 2 * cellPadding) {
                        break;
                    }
                    fontSize -= 1;
                }

                let centerX = screen_x + screen_width / 2;
                let centerY = screen_y + screen_height / 2;
                ctx.fillText(text, centerX, centerY);
            },

            SIMPLE_TEXT_VAR_FONT: (graph, grid, ctx, min, max, x, y, well) => {
                const safeNumber = (value, fallback = 0) => (typeof value === 'number' && !isNaN(value) ? value : fallback);

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;

                ctx.fillStyle = well.select ? 'magenta' : (well.color || 'white');
                ctx.strokeStyle = "rgba(120, 120, 100, 0.49)";
                ctx.lineWidth = 1 * scaleFactor;
                ctx.shadowBlur = 0;
                ctx.shadowColor = "rgba(40, 0, 0, 0.7)";

                const cornerRadius = 5 * scaleFactor;
                drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius);
                ctx.fill();
                ctx.stroke();

                let centerX = screen_x + screen_width / 2;
                let centerY = screen_y + screen_height / 2;

                if (well.icon) {
                    if (!well.icon.draw) {
                        well.icon = Icon.buildFromJSON(well.icon);
                    }
                    if (well.icon) {
                        well.icon.x = grid.X(x);
                        well.icon.y = grid.Y(y);
                        well.icon.w = graph.worldWidth(screen_width);
                        well.icon.h = graph.worldHeight(screen_height);
                        well.icon.draw(graph, ctx);
                    }
                }

                if (well.value && typeof well.value === 'string') {
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.shadowBlur = 0;

                    let rawHTML = String(well.value);
                    const padding = 10;
                    const maxFontSize = 20;
                    const minFontSize = 6;

                    let bestFontSize = minFontSize;
                    let bestLines = [];

                    for (let size = maxFontSize; size >= minFontSize; size--) {
                        let testLines = parseAndWrapHTML(rawHTML, ctx, screen_width - 2 * padding, size);
                        let totalTextHeight = testLines.length * size * 1.3;
                        if (totalTextHeight <= screen_height - 2 * padding) {
                            bestFontSize = size;
                            bestLines = testLines;
                            break;
                        }
                    }

                    let startY = centerY - (bestLines.length * bestFontSize * 1.3) / 2 + bestFontSize / 2;
                    bestLines.forEach((line, i) => {
                        let lineY = startY + i * bestFontSize * 1.3;
                        let currentX = screen_x + padding;
                        line.forEach(segment => {
                            ctx.font = `${segment.bold ? 'bold ' : ''}${segment.italic ? 'italic ' : ''}${bestFontSize}pt Arial`;
                            ctx.fillStyle = well.fgcolor || 'black';
                            ctx.fillText(segment.text, currentX, lineY);
                            currentX += ctx.measureText(segment.text).width;
                        });
                    });
                }

                function parseAndWrapHTML(html, ctx, maxWidth, fontSize) {
                    const tokens = html
                        .replace(/<br\s*\/?>/gi, '\n')
                        .split(/(<\/?[bi]>|\n)/gi)
                        .filter(Boolean);

                    let lines = [], currentLine = [], currentText = '', bold = false, italic = false;

                    tokens.forEach(token => {
                        if (token === '<b>') bold = true;
                        else if (token === '</b>') bold = false;
                        else if (token === '<i>') italic = true;
                        else if (token === '</i>') italic = false;
                        else if (token === '\n') {
                            if (currentText) {
                                currentLine.push({ text: currentText, bold, italic });
                                currentText = '';
                            }
                            lines.push(currentLine);
                            currentLine = [];
                        } else {
                            let words = token.split(' ');
                            for (let word of words) {
                                let testText = currentText ? currentText + ' ' + word : word;
                                ctx.font = `${bold ? 'bold ' : ''}${italic ? 'italic ' : ''}${fontSize}pt Arial`;
                                if (ctx.measureText(testText).width > maxWidth && currentText) {
                                    currentLine.push({ text: currentText, bold, italic });
                                    lines.push(currentLine);
                                    currentLine = [];
                                    currentText = word;
                                } else {
                                    currentText = testText;
                                }
                            }
                        }
                    });

                    if (currentText) currentLine.push({ text: currentText, bold, italic });
                    if (currentLine.length > 0) lines.push(currentLine);
                    return lines;
                }
            },

            'DOLLAR': (graph, grid, ctx, min, max, x, y, well) => {
                if (!graph || !grid || !ctx || !well) return;

                try {
                    const safeNumber = (value, fallback = 0) =>
                        (typeof value === 'number' && !isNaN(value)) ? value :
                            (typeof value === 'string' && value.trim() !== '' && !isNaN(+value)) ? +value :
                                fallback;

                    const currency = (typeof well.currency === 'string' && well.currency.length) ? well.currency : '$';
                    const zeroAsDash = ('accountingZeroAsDash' in well) ? !!well.accountingZeroAsDash : true;
                    const absFormat = (n, precision = 2) => new Intl.NumberFormat('en-US', {
                        minimumFractionDigits: precision,
                        maximumFractionDigits: precision
                    }).format(Math.abs(n));

                    const formatAccounting = (n) => {
                        if (n === 0 && zeroAsDash) return '—';
                        const s = absFormat(n);
                        return n < 0 ? `(${currency}${s})` : `${currency}${s}`;
                    };

                    let screen_x = safeNumber(graph.X(grid.X(well.x)));
                    let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                    let screen_width = safeNumber(well.__screen_width, 30);
                    let screen_height = safeNumber(well.__screen_height, 30);

                    screen_y += screen_height;
                    screen_y -= screen_height;

                    const scaleFactor = Math.min(screen_width, screen_height) / 60;
                    let fontSize = Math.max(9, 9 * scaleFactor);
                    ctx.font = `${fontSize}pt Arial`;

                    ctx.fillStyle = well.select ? 'magenta' : (well.color || 'white');
                    ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                    ctx.lineWidth = 1 * scaleFactor;
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = "rgba(40, 0, 0, 0.7)";

                    drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, 10);
                    ctx.fill();
                    ctx.stroke();

                    const centerX = screen_x + screen_width / 2;
                    const centerY = screen_y + screen_height / 2;

                    if (well.icon) {
                        if (typeof well.icon.draw !== 'function') {
                            try {
                                well.icon = Icon.buildFromJSON(well.icon);
                            } catch (e) {
                                console.warn("Failed to build icon from JSON", e);
                                well.icon = null;
                            }
                        }
                        if (well.icon && typeof well.icon.draw === 'function') {
                            well.icon.x = grid.X(x);
                            well.icon.y = grid.Y(y);
                            well.icon.w = graph.worldWidth(screen_width);
                            well.icon.h = graph.worldHeight(screen_height);
                            try { well.icon.draw(graph, ctx); } catch (e) { console.warn("Error drawing icon", e); }
                        }
                    }

                    if (well.value !== undefined && (well.value + '').length > 0) {
                        const numericValue = safeNumber(well.value, 0);

                        if (screen_height >= fontSize) {
                            ctx.font = `${fontSize}pt Arial`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.shadowBlur = 0;

                            const negColor = well.negColor || 'crimson';
                            const posColor = well.fgcolor || 'black';
                            ctx.fillStyle = (numericValue < 0) ? negColor : posColor;

                            let displayValue = formatAccounting(numericValue);
                            displayValue = truncateTextCached(displayValue, screen_width - 10, ctx);
                            ctx.fillText(displayValue, centerX, centerY);
                        }
                    }
                } catch (error) {
                    console.error("Error rendering DOLLAR well (accounting):", error);
                }
            }
            ,
            'USD': (graph, grid, ctx, min, max, x, y, well) => {
                if (!graph || !grid || !ctx || !well) return;

                try {
                    const safeNumber = (value, fallback = 0) =>
                        (typeof value === 'number' && !isNaN(value)) ? value :
                            (typeof value === 'string' && value.trim() !== '' && !isNaN(+value)) ? +value :
                                fallback;

                    const currency = (typeof well.currency === 'string' && well.currency.length) ? well.currency : '$';
                    const zeroAsDash = ('accountingZeroAsDash' in well) ? !!well.accountingZeroAsDash : true;
                    const absFormat = (n, precision = 2) => new Intl.NumberFormat('en-US', {
                        minimumFractionDigits: precision,
                        maximumFractionDigits: precision
                    }).format(Math.abs(n));

                    const formatAccounting = (n) => {
                        if (n === 0 && zeroAsDash) return '—';
                        const s = absFormat(n);
                        return n < 0 ? `(${currency}${s})` : `${currency}${s}`;
                    };

                    let screen_x = safeNumber(graph.X(grid.X(well.x)));
                    let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                    let screen_width = safeNumber(well.__screen_width, 30);
                    let screen_height = safeNumber(well.__screen_height, 30);

                    screen_y += screen_height;
                    screen_y -= screen_height;

                    const scaleFactor = Math.min(screen_width, screen_height) / 60;
                    let fontSize = Math.max(9, 9 * scaleFactor);
                    ctx.font = `${fontSize}pt Arial`;

                    ctx.fillStyle = well.select ? 'magenta' : (well.color || 'white');
                    ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                    ctx.lineWidth = 1 * scaleFactor;
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = "rgba(40, 0, 0, 0.7)";

                    drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, 10);
                    ctx.fill();
                    ctx.stroke();

                    const centerX = screen_x + screen_width / 2;
                    const centerY = screen_y + screen_height / 2;

                    if (well.icon) {
                        if (typeof well.icon.draw !== 'function') {
                            try {
                                well.icon = Icon.buildFromJSON(well.icon);
                            } catch (e) {
                                console.warn("Failed to build icon from JSON", e);
                                well.icon = null;
                            }
                        }
                        if (well.icon && typeof well.icon.draw === 'function') {
                            well.icon.x = grid.X(x);
                            well.icon.y = grid.Y(y);
                            well.icon.w = graph.worldWidth(screen_width);
                            well.icon.h = graph.worldHeight(screen_height);
                            try { well.icon.draw(graph, ctx); } catch (e) { console.warn("Error drawing icon", e); }
                        }
                    }

                    if (well.value !== undefined && (well.value + '').length > 0) {
                        const numericValue = safeNumber(well.value, 0);

                        if (screen_height >= fontSize) {
                            ctx.font = `${fontSize}pt Arial`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.shadowBlur = 0;

                            const negColor = well.negColor || 'crimson';
                            const posColor = well.fgcolor || 'black';
                            ctx.fillStyle = (numericValue < 0) ? negColor : posColor;

                            let displayValue = formatAccounting(numericValue);
                            displayValue = truncateTextCached(displayValue, screen_width - 10, ctx);
                            ctx.fillText(displayValue, centerX, centerY);
                        }
                    }
                } catch (error) {
                    console.error("Error rendering DOLLAR well (accounting):", error);
                }
            },

            'TRANSPARENT': (graph, grid, ctx, min, max, x, y, well) => {
                if (!graph || !grid || !ctx || !well) return;

                try {
                    const safeNumber = (value, fallback = 0) => (typeof value === 'number' && !isNaN(value) ? value : fallback);

                    let screen_x = safeNumber(graph.X(grid.X(well.x)));
                    let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                    let screen_width = safeNumber(well.__screen_width, 30);
                    let screen_height = safeNumber(well.__screen_height, 30);
                    screen_y += screen_height;
                    screen_y -= screen_height;

                    const scaleFactor = Math.min(screen_width, screen_height) / 60;
                    let fontSize = Math.max(9, 9 * scaleFactor);
                    ctx.font = `${fontSize}pt Arial`;
                    ctx.fillStyle = well.select ? 'magenta' : (well.color || 'white');

                    ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                    ctx.lineWidth = well.select ? 5 * scaleFactor : 2 * scaleFactor;
                    ctx.shadowBlur = well.select ? 10 : 1;
                    ctx.shadowColor = well.select ? 'magenta' : "rgba(40, 0, 0, 0.7)";

                    drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, 10);
                    ctx.stroke();

                    const centerX = screen_x + screen_width / 2;
                    const centerY = screen_y + screen_height / 2;

                    if (well.icon) {
                        if (typeof well.icon.draw !== 'function') {
                            try {
                                well.icon = Icon.buildFromJSON(well.icon);
                            } catch (e) {
                                console.warn("Failed to build icon from JSON", e);
                                well.icon = null;
                            }
                        }

                        if (well.icon && typeof well.icon.draw === 'function') {
                            well.icon.x = grid.X(x);
                            well.icon.y = grid.Y(y);
                            well.icon.w = graph.worldWidth(screen_width);
                            well.icon.h = graph.worldHeight(screen_height);

                            try {
                                well.icon.draw(graph, ctx);
                            } catch (e) {
                                console.warn("Error drawing icon", e);
                            }
                        }
                    }

                    if (well.value != undefined && (well.value + '').length > 0) {
                        if (screen_height >= fontSize) {
                            ctx.font = `${fontSize}pt Arial`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = well.fgcolor || 'black';
                            ctx.shadowBlur = 0;

                            let displayValue = (well.value)
                            displayValue = truncateTextCached(displayValue, screen_width - 10, ctx);
                            ctx.fillText(displayValue, centerX, centerY);
                        }
                    }
                } catch (error) {
                    console.error("Error rendering DOLLAR well:", error);
                }
            },

            'LABEL': (graph, grid, ctx, min, max, x, y, well) => {

                const safeNumber = (v, fallback = 0) => (typeof v === 'number' && !isNaN(v) ? v : fallback);

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = Math.max(1, safeNumber(well.__screen_width, 30));
                let screen_height = Math.max(1, safeNumber(well.__screen_height, 30));

                const scaleBase = Math.min(screen_width, screen_height);
                const scaleFactor = scaleBase / 60;
                const minFontPt = 7;
                const maxFontPt = 11;
                let fontSizePt = Math.min(Math.max(9 * scaleFactor, minFontPt), maxFontPt);

                const bg = well.select ? 'magenta' : (well.color || 'white');
                const fg = well.fgcolor || 'black';

                const strokeWidth = Math.max(0.75, 1 * scaleFactor);
                const pad = Math.max(1, 2 * scaleFactor);

                function pathRoundedRect(ctx, x, y, w, h, r) {
                    const rr = Math.min(r, w * 0.5, h * 0.5);
                    ctx.moveTo(x + rr, y);
                    ctx.arcTo(x + w, y, x + w, y + h, rr);
                    ctx.arcTo(x + w, y + h, x, y + h, rr);
                    ctx.arcTo(x, y + h, x, y, rr);
                    ctx.arcTo(x, y, x + w, y, rr);
                    ctx.closePath();
                }

                ctx.save();

                ctx.beginPath();
                pathRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, 4 * scaleFactor);
                ctx.clip();

                ctx.fillStyle = bg;
                ctx.fillRect(screen_x, screen_y, screen_width, screen_height);

                ctx.lineWidth = strokeWidth;

                const inset = strokeWidth / 2;
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.beginPath();
                pathRoundedRect(
                    ctx,
                    screen_x + inset,
                    screen_y + inset,
                    Math.max(0, screen_width - strokeWidth),
                    Math.max(0, screen_height - strokeWidth),
                    Math.max(0, 4 * scaleFactor - inset)
                );
                ctx.stroke();

                const centerX = screen_x + screen_width / 2;
                const centerY = screen_y + screen_height / 2;

                const displayValue = (well.value != null) ? String(well.value) : '';

                if (displayValue) {

                    const availW = Math.max(0, screen_width - 2 * pad);
                    const availH = Math.max(0, screen_height - 2 * pad);

                    let pt = fontSizePt;
                    const lineHeightFactor = 1.15;
                    while (pt > minFontPt) {
                        ctx.font = `${pt}pt Arial`;
                        const m = ctx.measureText(displayValue);
                        const textW = m.width;
                        const textH = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0);
                        const lineH = Math.max(textH, pt * lineHeightFactor);

                        if (textW <= availW && lineH <= availH) break;
                        pt -= 0.5;
                    }
                    fontSizePt = Math.max(pt, minFontPt);
                    ctx.font = `${fontSizePt}pt Arial`;

                    let textToDraw = displayValue;
                    let metrics = ctx.measureText(textToDraw);
                    if (metrics.width > availW) {
                        const ell = '…';
                        while (textToDraw.length > 1 && ctx.measureText(textToDraw + ell).width > availW) {
                            textToDraw = textToDraw.slice(0, -1);
                        }
                        textToDraw += ell;
                    }

                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = fg;
                    ctx.shadowBlur = 0;

                    ctx.fillText(textToDraw, centerX, centerY);
                }

                ctx.restore();

            },
            Input_Dollar_Amount: (graph, grid, ctx, min, max, x, y, well) => {
                const safeNumber = (v, fallback = 0) => typeof v === 'number' && !isNaN(v) ? v : fallback;
                const cellPadding = 6;
                const inset = 2;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;
                let fontSize = Math.max(11 * scaleFactor, 9);
                const cornerRadius = 4 * scaleFactor;

                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowBlur = 6;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                drawInputFieldWithRedBorder(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius, well);
                ctx.restore();

                let raw = parseFloat((well.value || "").toString().replace(/[^\d.-]/g, ''));
                if (isNaN(raw)) raw = 0;
                let text = '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(raw);

                ctx.font = `${fontSize}pt Arial`;
                ctx.fillStyle = well.fgcolor || 'black';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const maxTextWidth = screen_width - 2 * (cellPadding + inset);
                while (ctx.measureText(text + '...').width > maxTextWidth && text.length > 0) text = text.slice(0, -1);
                if (ctx.measureText(text).width > maxTextWidth) text += "...";

                ctx.fillText(text, screen_x + screen_width / 2, screen_y + screen_height / 2);
            },

            Input_Percent: (graph, grid, ctx, min, max, x, y, well) => {
                const safeNumber = (v, fallback = 0) => typeof v === 'number' && !isNaN(v) ? v : fallback;
                const cellPadding = 6;
                const inset = 2;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;
                let fontSize = Math.max(11 * scaleFactor, 9);
                const cornerRadius = 4 * scaleFactor;

                drawInputFieldWithRedBorder(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius, well);

                let raw = 100 * parseFloat((well.value || "").toString().replace(/[^\d.-]/g, ''));
                if (isNaN(raw)) raw = 0;

                let text = new Intl.NumberFormat('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }).format(raw) + '%';

                ctx.font = `${fontSize}pt Arial`;
                ctx.fillStyle = well.fgcolor || 'black';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const maxTextWidth = screen_width - 2 * (cellPadding + inset);
                while (ctx.measureText(text + '...').width > maxTextWidth && text.length > 0) text = text.slice(0, -1);
                if (ctx.measureText(text).width > maxTextWidth) text += "...";

                ctx.fillText(text, screen_x + screen_width / 2, screen_y + screen_height / 2);
            },

            Input_Number: (graph, grid, ctx, min, max, x, y, well) => {
                const safeNumber = (v, fallback = 0) => typeof v === 'number' && !isNaN(v) ? v : fallback;
                const cellPadding = 6;
                const inset = 2;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;
                let fontSize = Math.max(11 * scaleFactor, 9);
                const cornerRadius = 4 * scaleFactor;

                drawInputFieldWithRedBorder(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius, well);

                const abbreviate = (value) => {
                    const abs = Math.abs(value);
                    if (abs >= 1e12) return (value / 1e12).toFixed(2) + 'T';
                    if (abs >= 1e9) return (value / 1e9).toFixed(2) + 'B';
                    if (abs >= 1e6) return (value / 1e6).toFixed(2) + 'M';
                    if (abs >= 1e3) return (value / 1e3).toFixed(2) + 'K';
                    return value.toFixed(2);
                };

                let raw = parseFloat((well.value || "").toString().replace(/[^\d.-]/g, ''));
                if (isNaN(raw)) raw = 0;
                let text = abbreviate(raw);

                ctx.font = `${fontSize}pt Arial`;
                ctx.fillStyle = well.fgcolor || 'black';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                const maxTextWidth = screen_width - 2 * (cellPadding + inset);
                while (ctx.measureText(text + '...').width > maxTextWidth && text.length > 0) text = text.slice(0, -1);
                if (ctx.measureText(text).width > maxTextWidth) text += "...";

                ctx.fillText(text, screen_x + cellPadding + inset, screen_y + screen_height / 2);
            },

            Input_Percent: (graph, grid, ctx, min, max, x, y, well) => {
                const safeNumber = (v, f = 0) => typeof v === 'number' && !isNaN(v) ? v : f;
                const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
                const cellPadding = 6;
                const inset = 2;

                const arrowDepthPct = 0.10;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const h = screen_height;
                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;
                const cornerRadius = clamp(h * 0.12, 3, 12);

                drawInputFieldWithRedBorder(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius, well);

                (function drawPunchyArrow() {
                    const shaftLen = clamp(h * 0.85, 14, 54);
                    const headSize = clamp(h * 0.55, 10, 30);
                    const thickness = clamp(h * 0.28, 3, 14);
                    const innerPad = clamp(h * 0.12, 3, 12);

                    const tipX = clamp(
                        screen_x + screen_width * arrowDepthPct,
                        screen_x + innerPad + headSize,
                        screen_x + screen_width - innerPad - headSize
                    );
                    const tipY = screen_y + h / 2;

                    const shaftEndX = tipX - headSize;
                    const startX = Math.max(screen_x + innerPad, shaftEndX - shaftLen);
                    const startY = tipY;
                    const halfT = thickness / 2;

                    const pathShaft = () => {
                        ctx.beginPath();
                        ctx.moveTo(startX, startY - halfT);
                        ctx.lineTo(shaftEndX, startY - halfT);
                        ctx.arc(shaftEndX, startY, halfT, -Math.PI / 2, Math.PI / 2);
                        ctx.lineTo(startX, startY + halfT);
                        ctx.arc(startX, startY, halfT, Math.PI / 2, -Math.PI / 2, true);
                        ctx.closePath();
                    };
                    const pathHead = () => {
                        ctx.beginPath();
                        ctx.moveTo(tipX, tipY);
                        ctx.lineTo(shaftEndX, tipY - headSize * 0.7);
                        ctx.lineTo(shaftEndX, tipY + headSize * 0.7);
                        ctx.closePath();
                    };

                    ctx.save();
                    ctx.shadowColor = 'rgba(0,0,0,0.55)';
                    ctx.shadowBlur = clamp(h * 0.22, 4, 16);
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = clamp(h * 0.08, 1, 8);
                    ctx.fillStyle = '#FFE769';
                    pathShaft(); ctx.fill();
                    pathHead(); ctx.fill();
                    ctx.restore();

                    ctx.save();
                    ctx.fillStyle = '#8cff00ff';
                    ctx.strokeStyle = '#0b0904ff';
                    ctx.lineWidth = clamp(thickness * 0.33, 1.5, 3);
                    pathShaft(); ctx.fill(); ctx.stroke();
                    pathHead(); ctx.fill(); ctx.stroke();

                    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                    ctx.lineWidth = clamp(thickness * 0.18, 1, 2);
                    ctx.beginPath();
                    ctx.moveTo(tipX - headSize * 0.15, tipY - headSize * 0.58);
                    ctx.lineTo(tipX, tipY);
                    ctx.lineTo(tipX - headSize * 0.15, tipY + headSize * 0.58);
                    ctx.stroke();
                    ctx.restore();
                })();

                let raw = 100 * parseFloat((well.value || "").toString().replace(/[^\d.-]/g, ''));
                if (isNaN(raw)) raw = 0;

                let text = new Intl.NumberFormat('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }).format(raw) + '%';

                const fontSize = Math.max(11 * scaleFactor, 9);
                ctx.font = `${fontSize}pt Arial`;
                ctx.fillStyle = well.fgcolor || 'black';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const maxTextWidth = screen_width - 2 * (cellPadding + inset);
                while (ctx.measureText(text + '...').width > maxTextWidth && text.length > 0) text = text.slice(0, -1);
                if (ctx.measureText(text).width > maxTextWidth) text += "...";

                ctx.fillText(text, screen_x + screen_width / 2, screen_y + screen_height / 2);
            }

            ,

            'PACKAGE': (graph, grid, ctx, min, max, x, y, well) => {
                let screen_x = graph.X(grid.xi);
                let screen_y = graph.Y(grid.yi);
                let screen_width = graph.screenWidth(grid.width);
                let screen_height = graph.screenHeight(grid.height);
                screen_y -= screen_height;

                const scaleFactor = Math.min(screen_width, screen_height) / 60;

                let maxFontSize = 20 * scaleFactor;
                let minFontSize = 6;

                ctx.fillStyle = "rgba(182, 130, 255, 0.87)";
                ctx.strokeStyle = "rgb(255, 255, 255)";
                ctx.lineWidth = 1 * scaleFactor;
                ctx.shadowBlur = 2;
                ctx.shadowColor = "rgb(0, 0, 0)";

                let tabWidth = screen_width * 0.4;
                let tabHeight = screen_height * 0.2;
                let tabX = screen_x;
                let tabY = screen_y - tabHeight;
                let tabRadius = 10;

                ctx.beginPath();
                ctx.moveTo(tabX + tabRadius, tabY);
                ctx.arcTo(tabX + tabWidth, tabY, tabX + tabWidth, tabY + tabRadius, tabRadius);
                ctx.lineTo(tabX + tabWidth, screen_y);
                ctx.arcTo(tabX + tabWidth, screen_y, tabX + tabWidth - tabRadius, screen_y, tabRadius);
                ctx.lineTo(tabX + tabRadius, screen_y);
                ctx.arcTo(tabX, screen_y, tabX, tabY + tabRadius, tabRadius);
                ctx.arcTo(tabX, tabY, tabX + tabRadius, tabY, tabRadius);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                ctx.beginPath();
                drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, 10);
                ctx.fill();

                let centerX = screen_x + screen_width / 2;
                let centerY = screen_y + screen_height / 2;

                if (well.icon) {
                    if (!well.icon.draw) {
                        well.icon = Icon.buildFromJSON(well.icon);
                    }
                    if (well.icon) {
                        well.icon.x = grid.X(x);
                        well.icon.y = grid.Y(y);
                        well.icon.w = graph.worldWidth(screen_width);
                        well.icon.h = graph.worldHeight(screen_height);
                        well.icon.draw(graph, ctx);
                    }
                }

                if (typeof well.value !== 'undefined' && well.value !== null) {
                    let displayValue = typeof well.value === 'string'
                        ? well.value
                        : (well.value != null ? well.value : '');

                    if (well.group && (well.group['dollar'] || well.group['$'])) {
                        displayValue = '$' + new Intl.NumberFormat('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }).format(parseFloat(displayValue));
                    }

                    let testFontSize = maxFontSize;
                    let padding = 10;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = well.fgcolor || 'black';

                    while (testFontSize > minFontSize) {
                        ctx.font = `${testFontSize}pt Arial`;
                        const metrics = ctx.measureText(displayValue);
                        const textWidth = metrics.width;
                        const textHeight = testFontSize * 1.2;

                        if (textWidth <= screen_width - padding * 2 && textHeight <= screen_height - padding * 2) {
                            break;
                        }
                        testFontSize -= 1;
                    }

                    ctx.font = `${testFontSize}pt Arial`;
                    ctx.fillText(displayValue, centerX, centerY);
                }

            },
            'FUNCTION': (graph, grid, ctx, min, max, x, y, well) => {
                let screen_x = graph.X(grid.xi);
                let screen_y = graph.Y(grid.yi);
                let screen_width = graph.screenWidth(grid.width);
                let screen_height = graph.screenHeight(grid.height);
                screen_y -= screen_height;

                const scaleFactor = Math.min(screen_width, screen_height) / 60;
                let fontSize = 9 * scaleFactor;
                if (fontSize < 9) {
                    fontSize = 9;
                }
                ctx.font = `${fontSize}pt Arial`;
                ctx.fillStyle = 'white';
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                ctx.shadowBlur = 0;
                ctx.shadowColor = "rgba(40, 0, 0, 0.7)";

                drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, 10);
                ctx.fill();
                ctx.stroke();

                let centerX = screen_x + screen_width / 2;
                let centerY = screen_y + screen_height / 2;

                if (well.icon) {
                    if (!well.icon.draw) {
                        well.icon = Icon.buildFromJSON(well.icon)
                    }
                    if (well.icon) {
                        well.icon.x = grid.X(x)
                        well.icon.y = grid.Y(y)
                        well.icon.w = graph.worldWidth(screen_width);
                        well.icon.h = graph.worldHeight(screen_height);
                        well.icon.draw(graph, ctx)
                    }
                }

                if (screen_height >= fontSize) {
                    ctx.font = `${fontSize}pt Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = well.fgcolor || 'black';
                    ctx.shadowBlur = 0;

                    let displayValue = typeof well.value === 'string'
                        ? truncateText(well.value, screen_width - 10, ctx)
                        : (well.value != null ? well.value : '');

                    ctx.fillText(displayValue, centerX, centerY);
                }

            },
            'ICON': (graph, grid, ctx, min, max, x, y, well) => {
                let screen_x = graph.X(grid.xi);
                let screen_y = graph.Y(grid.yi);
                let screen_width = graph.screenWidth(grid.width);
                let screen_height = graph.screenHeight(grid.height);
                screen_y -= screen_height;

                const scaleFactor = Math.min(screen_width, screen_height) / 60;
                let fontSize = 9 * scaleFactor;
                if (fontSize < 9) {
                    fontSize = 9;
                }
                ctx.font = `${fontSize}pt Arial`;
                ctx.fillStyle = 'white';
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                ctx.shadowBlur = 0;
                ctx.shadowColor = "rgba(40, 0, 0, 0.7)";
                ctx.fill();
                ctx.stroke();
                let centerX = screen_x + screen_width / 2;
                let centerY = screen_y + screen_height / 2;
                if (well.icon) {
                    if (!well.icon.draw) {
                        well.icon = Icon.buildFromJSON(well.icon)
                    }

                    if (well.icon) {
                        well.icon.x = grid.X(x)
                        well.icon.y = grid.Y(y)
                        well.icon.w = graph.worldWidth(screen_width);
                        well.icon.h = graph.worldHeight(screen_height);
                        well.icon.draw(graph, ctx)
                    }
                }

                if (screen_height >= fontSize) {
                    ctx.font = `${fontSize}pt Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = well.fgcolor || 'black';
                    ctx.shadowBlur = 0;

                    let displayValue = typeof well.value === 'string'
                        ? truncateText(well.value, screen_width - 10, ctx)
                        : (well.value != null ? well.value : '');

                    ctx.fillText(displayValue, centerX, centerY);
                }

            }
            ,
            'Function': (graph, grid, ctx, min, max, x, y, well) => {
                if (!ctx || well.name == null) {
                    return;
                }
                let offset = 4;
                ctx.textAlign = 'left';
                ctx.fillStyle = well.group && well.group in WellColorPallette ? WellColorPallette[well.group] : 'rgba(220,120,220,0.3)';
                ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                    graph.screenWidth(grid.screenWidth(1)) - offset * 2, graph.screenHeight(grid.screenHeight(1)) - offset);
                ctx.stroke();
                if (well.select) {
                    ctx.fillStyle = 'rgba(255, 165, 0, 0.7)';
                    ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                        graph.screenWidth(grid.screenWidth(1)) - offset, graph.screenHeight(grid.screenHeight(1)) - offset);
                    ctx.stroke();
                }

                let wellWidth = graph.screenWidth(grid.screenWidth(1));
                let wellHeight = graph.screenHeight(grid.screenHeight(1));
                let centerX = graph.X(grid.X(x)) + wellWidth / 2;
                let centerY = graph.Y(grid.Y(y)) + wellHeight / 6;

                ctx.textAlign = 'right';
                ctx.fillStyle = 'darkGray';

                if (well.value != null) {
                    ctx.font = "11pt Arial";
                    ctx.fillStyle = 'darkGray';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    let valueY = centerY;
                    if (typeof well.value === 'string') {
                        ctx.fillText(`${well.value}`, centerX, valueY);
                    } else {
                        ctx.fillText(parseFloat(well.value).toFixed(2), centerX, valueY);
                    }
                }

                if (wellWidth < 55) {
                    offset = 1;
                    return;
                } else if (wellWidth < 280) {
                    ctx.font = "8pt Arial";
                    offset = 1;
                    ctx.fillStyle = 'black';

                    if (well.group) {
                        ctx.font = '8pt Arial';
                        ctx.fillStyle = 'gray';
                        ctx.textAlign = 'center';
                        ctx.fillText(` ${well.group}`, centerX, centerY - 20);
                    }

                    if (well.obj) {
                        ctx.font = "bold 12pt Arial";
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(`${well.obj}`, centerX, centerY);
                    }

                    if (well.formula != null) {
                        ctx.font = "10pt Arial";
                        ctx.fillStyle = 'black';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        let valueY = centerY + 15;
                        ctx.fillStyle = 'maroon';
                        ctx.fillText(`${well.formula}`, centerX, valueY);
                    }
                    ctx.stroke();
                } else {
                    ctx.font = "9pt Arial";
                    ctx.fillStyle = 'magenta';
                    let fontSize = 12;

                    if (well.score) {
                        let color = perc2color(well.score, min, max);
                        ctx.fillStyle = color;
                        ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                            graph.screenWidth(grid.screenWidth(1)) - offset, graph.screenHeight(grid.screenHeight(1)));
                        ctx.fillText(well.score.toFixed(2), graph.X(grid.X(x)) + 10, graph.Y(grid.Y(y)) - 15);
                        ctx.stroke();
                    }

                    if (well.group) {
                        ctx.font = '9px Arial';
                        ctx.fillStyle = 'gray';
                        ctx.textAlign = 'center';
                        ctx.fillText(`${well.group}`, centerX, centerY - 30);
                    }

                    if (well.obj) {
                        ctx.font = "bold 16pt Arial";
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(well.obj, centerX, centerY);
                    }

                    if (well.value != null) {
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = 'maroon';

                        fontSize = calculateFontSize(wellWidth, wellHeight, well.value, ctx);
                        ctx.font = `${fontSize}px Arial`;

                        let valueY = centerY + 20;
                        ctx.fillText(well.formula, centerX, valueY);
                    }

                    ctx.textAlign = 'left';
                    ctx.font = '9px Arial';
                    ctx.fillStyle = 'black';
                    ctx.fillText(well.position, graph.X(grid.X(x)) + 10, graph.Y(grid.Y(y)) + wellHeight - 10);

                    ctx.stroke();
                }
            },

            'Targets':

                (graph, grid, ctx, min, max, x, y, well) => {
                    if (!ctx || well.name == null) {
                        return;
                    }
                    let offset = 4;
                    ctx.textAlign = 'left';
                    ctx.fillStyle = well.group && well.group in WellColorPallette ? WellColorPallette[well.group] : 'rgba(220,220,220,0.3)';
                    ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                        graph.screenWidth(grid.screenWidth(1)) - offset * 2, graph.screenHeight(grid.screenHeight(1)) - offset);
                    ctx.stroke();

                    if (well.select) {
                        ctx.fillStyle = 'rgba(255, 165, 0, 0.7)';
                        ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                            graph.screenWidth(grid.screenWidth(1)) - offset, graph.screenHeight(grid.screenHeight(1)) - offset);
                        ctx.stroke();
                    }

                    let wellWidth = graph.screenWidth(grid.screenWidth(1));
                    let wellHeight = graph.screenHeight(grid.screenHeight(1));
                    let centerX = graph.X(grid.X(x)) + wellWidth / 2;
                    let centerY = graph.Y(grid.Y(y)) + wellHeight / 2;

                    ctx.textAlign = 'right';
                    ctx.font = '8px Arial';
                    ctx.fillStyle = 'gray';
                    ctx.fillText(`(${this.position})`, graph.X(grid.X(x)) + wellWidth - 5, graph.Y(grid.Y(y)) + 10);

                    if (wellWidth < 55) {
                        offset = 1;
                        return;
                    } else if (wellWidth < 280) {
                        ctx.font = "8pt Arial";
                        offset = 1;
                        ctx.fillStyle = 'black';
                        if (well.obj) {
                            ctx.font = "bold 12pt Arial";
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.color = 'black';
                            ctx.fillText(`${well.obj}`, centerX, centerY);
                        }
                        if (well.value != null) {
                            ctx.font = "8pt Arial";
                            ctx.fillStyle = 'black';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            let valueY = centerY + 15;
                            if (typeof well.value === 'string') {
                                ctx.fillStyle = 'maroon';
                                ctx.fillText('' + well.value + '', centerX, valueY);
                            } else {
                                ctx.fillText(parseFloat(well.value).toFixed(2), centerX, valueY);
                            }
                        }
                        ctx.stroke();
                    } else {
                        ctx.font = "9pt Arial";
                        ctx.fillStyle = 'magenta';
                        let fontSize = 12;

                        if (well.score) {
                            let color = perc2color(well.score, min, max);
                            ctx.fillStyle = color;
                            ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                                graph.screenWidth(grid.screenWidth(1)) - offset, graph.screenHeight(grid.screenHeight(1)));
                            ctx.fillText(well.score.toFixed(2), graph.X(grid.X(x)) + 10, graph.Y(grid.Y(y)) - 15);
                            ctx.stroke();
                        }

                        if (well.obj) {
                            ctx.font = "bold 16pt Arial";
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.color = 'black';
                            ctx.fillText(well.obj, centerX, centerY);
                        }

                        if (well.value != null) {
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = 'black';

                            fontSize = calculateFontSize(wellWidth, wellHeight, well.value, ctx);
                            ctx.font = `${fontSize}px Arial`;

                            let valueY = centerY + 20;
                            if (typeof well.value === 'string') {
                                ctx.fillText(well.value, centerX, valueY);
                            } else {
                                ctx.fillText((well.value).toFixed(2), centerX, valueY);
                            }
                        }

                        ctx.textAlign = 'left';
                        ctx.font = '9px Arial';
                        ctx.fillStyle = 'black';
                        ctx.fillText(well.name, graph.X(grid.X(x)) + 10, graph.Y(grid.Y(y)) + wellHeight - 10);

                        ctx.stroke();
                    }
                },
            'DOLLAR1': (graph, grid, ctx, min, max, x, y, well, preferences) => {
                let screen_width = graph.screenWidth(grid.screenWidth(1));
                let screen_height = graph.screenHeight(grid.screenHeight(1));

                let screen_x = graph.X(grid.X(x));
                let screen_y = graph.Y(grid.Y(y));
                const centerX = screen_x + screen_width / 2;
                const centerY = screen_y + screen_height / 2;
                const padding = 4;

                ctx.save();

                if (well.group && Object.keys(well.group).length > 0) {
                    let groupKeys = Object.keys(well.group);
                    let segmentWidth = screen_width / groupKeys.length;
                    groupKeys.forEach((groupKey, index) => {
                        if (preferences && !preferences[groupKey]) {
                            preferences[groupKey] = generateRandomRGBAColor();
                        }
                        let fillColor = preferences?.[groupKey] || 'rgba(20,220,50,0.6)';
                        let rect_x = screen_x + index * segmentWidth;
                        ctx.fillStyle = fillColor;
                        ctx.fillRect(rect_x, screen_y, segmentWidth, screen_height);
                    });
                } else {
                    ctx.fillStyle = well.bgcolor || '#F5F5F5';
                    ctx.fillRect(screen_x, screen_y, screen_width, screen_height);
                }

                if (well.select) {
                    ctx.fillStyle = 'orange';
                    ctx.fillRect(screen_x, screen_y, screen_width, screen_height);
                } else {
                    ctx.strokeStyle = well.equations ? "rgba(120, 120, 100, 1)" : '#D3D3D3';
                    ctx.lineWidth = well.equations ? 1 : 1;
                    ctx.shadowBlur = well.equations ? 10 : 0;
                    ctx.shadowColor = well.equations ? "rgba(40, 0, 0, 0.7)" : "transparent";
                    ctx.strokeRect(screen_x, screen_y, screen_width, screen_height);
                }

                const truncateText = (text, maxWidth) => {
                    let truncated = text;
                    while (ctx.measureText(truncated).width > maxWidth && truncated.length > 0) {
                        truncated = truncated.slice(0, -1);
                    }
                    return truncated + (truncated.length < text.length ? '…' : '');
                };

                const formatMoney = (val) => {
                    const num = parseFloat(val);
                    if (isNaN(num)) return `$${val}`;
                    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
                    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
                    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
                    return `$${num.toFixed(0)}`;
                };

                if (typeof well.value !== 'undefined' && well.value !== null) {
                    let fontSize = Math.max(7, Math.min(screen_height, screen_width) / 2.5);
                    ctx.font = `${fontSize}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = well.fgcolor || 'black';
                    ctx.shadowBlur = 0;

                    const moneyText = formatMoney(well.value);
                    const safeText = truncateText(moneyText, screen_width - padding * 2);
                    ctx.fillText(safeText, centerX, centerY);
                }

                if (screen_height > 90 && screen_width > 90) {
                    let infoFontSize = Math.max(8, screen_height * 0.1);
                    ctx.font = `${infoFontSize}px Arial`;
                    ctx.textAlign = 'left';
                    let offsetY = screen_y + 10;

                    if (well.group) {
                        Object.keys(well.group).forEach(groupKey => {
                            let groupText = `Grp: ${truncateText(groupKey, screen_width - 10)}`;
                            ctx.fillText(groupText, screen_x + 5, offsetY);
                            offsetY += infoFontSize + 2;
                        });
                    }

                    if (well.position) {
                        ctx.fillText(`Pos: ${well.position}`, screen_x + 5, offsetY);
                    }
                }

                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.restore();
            },

            'GROUP':

                (graph, grid, ctx, min, max, x, y, well) => {
                    if (!ctx || well.name == null) {
                        return;
                    }
                    ctx.shadowBlur = 0;

                    let offset = 0;
                    ctx.textAlign = 'left';

                    let groupKeys = well.group && typeof well.group === 'object' ? Object.keys(well.group) : [];

                    ctx.fillStyle = groupKeys.length > 0 ? WellColorPallette[groupKeys[0]] || 'rgba(220,220,220,0.3)' : 'rgba(220,220,220,0.3)';

                    ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                        graph.screenWidth(grid.screenWidth(1)) - offset * 2, graph.screenHeight(grid.screenHeight(1)) - offset);
                    ctx.stroke();

                    if (well.select) {
                        ctx.fillStyle = 'rgba(255, 165, 0, 0.7)';
                        ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                            graph.screenWidth(grid.screenWidth(1)) - offset, graph.screenHeight(grid.screenHeight(1)) - offset);
                        ctx.stroke();
                    }

                    let wellWidth = graph.screenWidth(grid.screenWidth(1));
                    let wellHeight = graph.screenHeight(grid.screenHeight(1));
                    let centerX = graph.X(grid.X(x)) + wellWidth / 2;
                    let centerY = graph.Y(grid.Y(y)) + wellHeight / 2;

                    ctx.textAlign = 'right';
                    ctx.font = '8px Arial';
                    ctx.fillStyle = 'black';
                    ctx.fillText(`(${well.position})`, graph.X(grid.X(x)) + wellWidth - 5, graph.Y(grid.Y(y)) + 10);

                    if (wellWidth < 55) {

                        if (groupKeys.length > 0) {
                            ctx.fillStyle = 'black';
                            ctx.font = "8pt Arial";
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(`${groupKeys[0]}`, centerX, centerY);
                        }
                        offset = 0;
                        return;
                    } else if (wellWidth < 280) {
                        ctx.font = "8pt Arial";
                        ctx.fillStyle = 'black';

                        if (groupKeys.length > 0) {
                            ctx.font = "8pt Arial";
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(`${groupKeys.join(', ')}`, centerX, centerY);
                        }

                        ctx.stroke();
                    } else {
                        ctx.font = "9pt Arial";
                        ctx.fillStyle = 'magenta';
                        let fontSize = 12;

                        if (well.score) {
                            let color = perc2color(well.score, min, max);
                            ctx.fillStyle = color;
                            ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                                graph.screenWidth(grid.screenWidth(1)) - offset, graph.screenHeight(grid.screenHeight(1)));
                            ctx.fillText(well.score.toFixed(2), graph.X(grid.X(x)) + 10, graph.Y(grid.Y(y)) - 15);
                            ctx.stroke();
                        }

                        if (groupKeys.length > 0) {
                            ctx.font = '8px Arial';
                            ctx.fillStyle = 'black';
                            ctx.shadowBlur = 0;
                            ctx.textAlign = 'center';
                            ctx.fillText(`${groupKeys.join(', ')}`, centerX, centerY - 30);
                        }

                        if (well.obj) {
                            ctx.font = "bold 16pt Arial";
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(well.obj, centerX, centerY);
                        }

                        if (well.value != null) {
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = 'black';

                            fontSize = calculateFontSize(wellWidth, wellHeight, well.value, ctx);
                            ctx.font = `${fontSize}px Arial`;

                            let valueY = centerY + 20;
                            if (typeof well.value === 'string') {
                                ctx.fillText(well.value, centerX, valueY);
                            } else {
                                ctx.fillText((well.value).toFixed(2), centerX, valueY);
                            }
                        }

                        ctx.textAlign = 'left';
                        ctx.font = '9px Arial';
                        ctx.fillStyle = 'black';
                        ctx.fillText(well.name, graph.X(grid.X(x)) + 10, graph.Y(grid.Y(y)) + wellHeight - 10);

                        ctx.stroke();
                    }
                },

            'CONCENTRATION': (graph, grid, ctx, min, max, x, y, well) => {
                if (!ctx || well.name == null) return;

                ctx.shadowBlur = 0;
                let offset = 0;
                ctx.textAlign = 'left';

                ctx.fillStyle = well.group && well.group in WellColorPallette ? WellColorPallette[well.group] : 'rgba(220,220,220,0.3)';
                ctx.fillRect(
                    graph.X(grid.X(x)) + offset,
                    graph.Y(grid.Y(y)) + offset,
                    graph.screenWidth(grid.screenWidth(1)) - offset * 2,
                    graph.screenHeight(grid.screenHeight(1)) - offset
                );
                ctx.stroke();

                if (well.select) {
                    ctx.fillStyle = 'rgba(255, 165, 0, 0.7)';
                    ctx.fillRect(
                        graph.X(grid.X(x)) + offset,
                        graph.Y(grid.Y(y)) + offset,
                        graph.screenWidth(grid.screenWidth(1)) - offset,
                        graph.screenHeight(grid.screenHeight(1)) - offset
                    );
                    ctx.stroke();
                }

                const wellWidth = graph.screenWidth(grid.screenWidth(1));
                const wellHeight = graph.screenHeight(grid.screenHeight(1));
                const centerX = graph.X(grid.X(x)) + wellWidth / 2;
                const centerY = graph.Y(grid.Y(y)) + wellHeight / 2;
                const baseX = graph.X(grid.X(x));
                const baseY = graph.Y(grid.Y(y));

                if (wellWidth >= 30) {
                    ctx.textAlign = 'right';
                    ctx.font = '8px Arial';
                    ctx.fillStyle = 'black';
                    ctx.fillText(`${well.position}`, baseX + wellWidth - 5, baseY + 15);
                }

                if (wellWidth < 55) {

                    if (well.concentration) {
                        ctx.font = "bold 8pt Arial";
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = 'black';
                        ctx.fillText(`${parseFloat(well.concentration).toFixed(2)}`, centerX, centerY);
                    }
                    return;
                }

                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
                ctx.font = '9px Arial';

                let nameText = well.name || '';
                const maxNameWidth = wellWidth - 10;

                while (ctx.measureText(nameText + '...').width > maxNameWidth && nameText.length > 0) {
                    nameText = nameText.slice(0, -1);
                }
                if (nameText.length < (well.name || '').length) {
                    nameText += '...';
                }

                const nameY = baseY + wellHeight - 18;
                ctx.fillStyle = 'black';
                ctx.fillText(nameText, baseX + 5, nameY);

                if (typeof well.concentration === 'number' && !isNaN(well.concentration)) {
                    const concText = `${parseFloat(well.concentration).toFixed(2)}`;
                    ctx.font = '8px Arial';
                    ctx.fillText(concText, baseX + 5, nameY + 12);
                }

                ctx.stroke();
            },

            'R2':
                (graph, grid, ctx, min, max, x, y, well) => {
                    if (!ctx || well.name == null) {
                        return;
                    }
                    let offset = 4;
                    ctx.textAlign = 'left';

                    let wellWidth = graph.screenWidth(grid.screenWidth(1));
                    let wellHeight = graph.screenHeight(grid.screenHeight(1));
                    let centerX = graph.X(grid.X(x)) + wellWidth / 2;
                    let centerY = graph.Y(grid.Y(y)) + wellHeight / 2;
                    if (well.properties && well.properties.r2 != null && well.properties.r2 >= 0 && well.properties.r2 <= 1) {
                        const r2ToColor = (r2) => {
                            let red = Math.min(255, Math.floor(255 * r2));
                            let blue = Math.min(255, Math.floor(255 * (1 - r2)));
                            return `rgb(${red}, 0, ${blue})`;
                        };
                        ctx.fillStyle = r2ToColor(well.properties.r2);
                        ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                            graph.screenWidth(grid.screenWidth(1)) - offset * 2, graph.screenHeight(grid.screenHeight(1)) - offset);
                        ctx.stroke();

                        if (wellWidth < 55) {
                            offset = 1;
                            if (well.select) {
                                ctx.fillStyle = 'rgba(255, 165, 0, 0.8)';
                                ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                                    graph.screenWidth(grid.screenWidth(1)) - offset, graph.screenHeight(grid.screenHeight(1)) - offset);
                                ctx.stroke();
                            }
                            return;
                        } else if (wellWidth < 280) {
                            ctx.font = "8pt Arial";
                            offset = 1;
                            ctx.fillStyle = 'black';

                            if (well.select) {
                                ctx.fillStyle = 'rgba(255, 165, 0, 0.8)';
                                ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                                    graph.screenWidth(grid.screenWidth(1)) - offset, graph.screenHeight(grid.screenHeight(1)) - offset);
                                ctx.stroke();
                            }

                            if (well.obj) {
                                ctx.font = "bold 14pt Arial";
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                ctx.color = 'black';

                                ctx.fillText(`${well.obj}`, centerX, centerY);
                            }

                            if (well.value != null) {
                                ctx.font = "8pt Arial";
                                ctx.fillStyle = 'black';
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                let valueY = centerY + 15;
                                if (typeof well.value === 'string') {
                                    ctx.fillStyle = 'maroon';
                                    ctx.fillText('' + well.value + '', centerX, valueY);
                                } else {
                                    ctx.fillText(parseFloat(well.value).toFixed(2), centerX, valueY);
                                }
                            }

                            ctx.stroke();
                        } else {
                            ctx.font = "9pt Arial";
                            ctx.fillStyle = 'magenta';
                            let fontSize = 12;

                            if (well.score) {
                                let color = perc2color(well.score, min, max);
                                ctx.fillStyle = color;
                                ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                                    graph.screenWidth(grid.screenWidth(1)) - offset, graph.screenHeight(grid.screenHeight(1)));
                                ctx.fillText(well.score.toFixed(2), graph.X(grid.X(x)) + 10, graph.Y(grid.Y(y)) - 15);
                                ctx.stroke();
                            }

                            if (well.select) {
                                ctx.fillStyle = 'rgba(255, 165, 0, 0.2)';
                                ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                                    graph.screenWidth(grid.screenWidth(1)) - offset, graph.screenHeight(grid.screenHeight(1)) - offset);
                                ctx.stroke();
                            }

                            if (well.obj) {
                                ctx.font = "bold 18pt Arial";
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                ctx.color = 'black';

                                ctx.fillText(well.obj, centerX, centerY);
                            }

                            if (well.value != null) {
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                ctx.fillStyle = 'black';

                                fontSize = calculateFontSize(wellWidth, wellHeight, well.value, ctx);
                                ctx.font = `${fontSize}px Arial`;

                                let valueY = centerY + 20;
                                if (typeof well.value === 'string') {
                                    ctx.fillText(well.value, centerX, valueY);
                                } else {
                                    ctx.fillText((well.value).toFixed(2), centerX, valueY);
                                }
                            }

                            ctx.textAlign = 'left';
                            ctx.font = '9px Arial';
                            ctx.fillStyle = 'black';
                            ctx.fillText(well.name, graph.X(grid.X(x)) + 10, graph.Y(grid.Y(y)) + wellHeight - 10);

                            ctx.stroke();
                        }
                    }
                },
            Input_Weight_mg: createInputWithUnit('mg'),
            Input_Weight_ug: createInputWithUnit('µg'),
            Input_Weight_kg: createInputWithUnit('kg'),
            Input_Weight_abbrev_g: createInputWithUnit('g', { abbreviate: true }),
            Input_Weight_ng: createInputWithUnit('ng'),
            Display_Weight_mg: createDisplayWithUnit('mg'),
            Display_Weight_ug: createDisplayWithUnit('µg'),
            Display_Weight_kg: createDisplayWithUnit('kg'),
            Display_Weight_abbrev_g: createDisplayWithUnit('g', { abbreviate: true }),
            Display_Weight_ng: createDisplayWithUnit('ng'),

        }
        resolve(t)
    })

}
