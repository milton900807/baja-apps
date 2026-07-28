function () {

    const drawString45 = (ctx, str, x, y, color, font) => {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        if (!font) {
            font = "12px Arial";
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'black';
        if (!color) {
            color = 'black'
        }
        ctx.font = font;
        ctx.fillStyle = color;

        let sx = (x);
        let sy = (y) - 5;

        ctx.save();

        ctx.translate(sx, sy);

        ctx.rotate(45 * Math.PI / 180);

        ctx.fillText(str, 0, 0);

        ctx.restore();

        ctx.stroke();
    }

    const drawString = (ctx, str, x, y, color, font) => {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        if (!font) {
            font = "15px Arial";
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'black';
        if (!color) {
            color = 'black'
        }
        if (font) {
            ctx.font = font;
        } else {
            ctx.font = '15px Arial'
        }
        ctx.fillStyle = color;
        let sx = (x);
        let sy = (y) - 5;

        ctx.fillText(str, sx, sy);
        ctx.stroke();

    }

    const drawLine = (ctx, xi, yi, xf, yf, color, lineSize, lineCap) => {
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'black';
        ctx.lineWidth = 2;

        if (color != null) {
            ctx.strokeStyle = color;
        }
        if (lineSize == null) {
            lineSize = 2;
        }
        if (lineCap == null) {
            ctx.lineCap = lineCap;
        }
        else {
            ctx.lineCap = 'butt';
        }
        ctx.shadowColor = 'black';
        ctx.lineWidth = lineSize;

        ctx.beginPath();
        ctx.moveTo((xi), (yi));
        ctx.lineTo((xf), (yf));
        ctx.stroke();
    }

    const drawVerticalLine = (ctx, x, y, vlength, color, lineWidth) => {
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'black';
        if (color != null) {
            ctx.strokeStyle = color;
        } else {
            ctx.strokeStyle = 'orange'
        }
        if (!lineWidth) {
            ctx.lineWidth = 1;
        } else
            ctx.lineWidth = lineWidth;
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'black';

        ctx.beginPath();
        ctx.moveTo((x), (y - vlength / 2));
        ctx.lineTo((x), (y + (vlength / 2)));
        ctx.stroke();
    }

    return {
        'UserAnnotation': createIon((ctx, grid, tgraph, xs, xf, y, color, annotation) => {
            color = annotation.color;
            rawVerticalLine(ctx, grid.X(tgraph.X(xs)), grid.Y(tgraph.Y(y)), 0.13, 'lightBlue', 0.5);
            drawVerticalLine(ctx, grid.X(tgraph.X(xf)), grid.Y(tgraph.Y(y)), 0.13, 'lightBlue', 0.7);
            drawLine(ctx, grid.X(tgraph.X(xs)), grid.Y(tgraph.Y(y)), grid.X(tgraph.X(xf)), grid.Y(tgraph.Y(y)), color, 13, 'butt');

        }),

        'Acceptor-Splice-Site': createIon((ctx, graph, tgraph, xss, xff, __y, color, annotation) => {
            var radius = 10;
            let xs = xss - 1;
            let xf = xff - 1;
            drawVerticalLine(graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(__y)), 0.63, 'lightBlue', 0.5)

            drawVerticalLine(graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(__y)), 0.63, 'lightBlue', 0.7)
            let x = (grid.X(xs) + graph.X(xf)) / 2;
            let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
            if (screencell > 4) {

                let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;

                ctx.shadowBlur = 2;
                ctx.shadowColor = 'black';

                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(x, graph.Y(tgraph.Y(__y)) + 10, radius, 0, 2 * Math.PI);
                ctx.fillStyle = 'white';
                ctx.fill();
                ctx.stroke();
                ctx.closePath();
                ctx.shadowBlur = 0;
                ctx.font = '13px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = 'black'

                ctx.fillText("A", x, graph.Y(tgraph.Y(__y)) + 10);
                ctx.textAlign = 'left'
            }
        }),
        'Acceptor-Splice-Site.highlight': createIon((ctx, graph, tgraph, xss, xff, __y, color, annotation) => {
            var radius = 10;
            let xs = xss - 1;
            let xf = xff - 1;

            graph.drawVerticalLine(xs, __y, 0.63, 'lightBlue', 0.5)
            graph.drawVerticalLine(xf, __y, 0.63, 'lightBlue', 0.7)
            let x = (graph.X(xs) + graph.X(xf)) / 2;
            var ctx = graph.canvas.getCTX();

            if (ctx) {
                ctx.shadowBlur = 7;
                ctx.shadowColor = 'black';
                ctx.lineWidth = 3;

                ctx.color = 'navy'
                let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
                if (screencell > 4) {
                    let x = (graph.X(xs) + graph.X(xf)) / 2;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(x, graph.Y(__y) + 10, radius, 0, 2 * Math.PI);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    ctx.stroke();
                    ctx.closePath();
                    ctx.shadowBlur = 0;
                    ctx.lineWidth = 1;

                    ctx.font = '13px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = 'black'
                    ctx.fillText("A", x, graph.Y(__y) + 10);
                    ctx.textAlign = 'left'

                }
            }
        }),
        'Donor-Splice-Site': createIon((ctx, graph, tgraph, xss, xff, y, color, annotation) => {
            var radius = 10;
            let xs = xss - 1;
            let xf = xff - 1;
            graph.drawVerticalLine(graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(__y)), 0.63, 'lightBlue', 0.5);
            graph.drawVerticalLine(graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(__y)), 0.63, 'lightBlue', 0.7);
            let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;
            ctx.shadowBlur = 7;
            ctx.shadowColor = 'black';
            ctx.lineWidth = 3;

            ctx.color = 'navy'
            let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
            if (screencell > 4) {
                let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, graph.Y(tgraph.Y(__y)) + 10, radius, 0, 2 * Math.PI);
                ctx.fillStyle = 'white';
                ctx.fill();
                ctx.stroke();
                ctx.closePath();
                ctx.shadowBlur = 0;
                ctx.lineWidth = 1;

                ctx.font = '13px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = 'black'
                ctx.fillText("A", x, graph.Y(tgraph.Y(__y)) + 10);
                ctx.textAlign = 'left'
            }

        }),
        'Donor-Splice-Site.highlight': createIon((ctx, graph, tgraph, xss, xff, y, color, annotation) => {
            var radius = 10;
            let xs = xss;
            let xf = xff;

            graph.drawLine(
                graph.X(tgraph.X(xs)) + ((graph.X(tgraph.X(xf)) - graph.X(tgraph.X(xs))) / 2),
                graph.Y(tgraph.Y(y)) + 0.05,
                graph.X(tgraph.X(xs)) + ((graph.X(tgraph.X(xf)) - graph.X(tgraph.X(xs))) / 2),
                graph.Y(tgraph.Y(y)),
                'rgb(200,200,200,0.3)', 3, 'butt'
            );

            graph.drawLine(
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'rgb(10,250,10,0.4)', 10, 'butt'
            );

            graph.drawVerticalLine(graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)), 0.13, 'magenta', 0.7);
            graph.drawVerticalLine(graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)), 0.13, 'magenta', 0.4);

            let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;
            ctx.shadowBlur = 7;
            ctx.shadowColor = 'black';
            let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
            if (screencell > 4) {
                let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(x, graph.Y(tgraph.Y(y)) + 10, radius, 0, 2 * Math.PI);
                ctx.fillStyle = 'white';
                ctx.fill();
                ctx.stroke();
                ctx.closePath();

                ctx.shadowBlur = 0;

                ctx.font = '13px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = 'black'

                ctx.fillText('D', x, graph.Y(tgraph.Y(y)) + 10);
                ctx.shadowBlur = 0;
            }

        }),

        'Canonical-Donor-Splice-Site': createIon((ctx, graph, tgraph, xss, xff, y, color, annotation) => {
            var radius = 10;
            let xs = xss;
            let xf = xff;

            graph.drawLine(
                graph.X(tgraph.X(xs)) + ((graph.X(tgraph.X(xf)) - graph.X(tgraph.X(xs))) / 2),
                graph.Y(tgraph.Y(y)) + 0.05,
                graph.X(tgraph.X(xs)) + ((graph.X(tgraph.X(xf)) - graph.X(tgraph.X(xs))) / 2),
                graph.Y(tgraph.Y(y)),
                'rgb(200,200,200,0.6)', 3, 'butt'
            );

            graph.drawLine(
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'rgb(100,150,100,0.4)', 10, 'butt'
            );

            graph.drawVerticalLine(graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)), 0.63, 'maroon', 0.5);
            graph.drawVerticalLine(graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)), 0.63, 'maroon', 0.5);

            let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;

            let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
            if (screencell > 4) {
                let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(x, graph.Y(tgraph.Y(y)) + 10, radius, 0, 2 * Math.PI);
                ctx.fillStyle = 'white';
                ctx.fill();
                ctx.stroke();
                ctx.closePath();

                ctx.shadowBlur = 0;

                ctx.font = '10px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = 'black'
                ctx.fillText("Donor", x, graph.Y(tgraph.Y(y)) + 10);
            }

        }),
        'Exon': createIon((ctx, graph, tgraph, xs, xf, yv, color, annotation, strand) => {
            ctx.setLineDash([]);
            ctx.lineCap = 'butt';

            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(yv)),
                graph.X(tgraph.X(xf + 1)), graph.Y(tgraph.Y(yv)),
                'rgba(130, 30, 158, 0.6)', 12, 'butt'
            );

            let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))

            if (annotation.showIndex) {
                if (annotation.index >= 0 && screencell < 0.52) {

                    var radius = 10;
                    var ctx = graph.canvas.getCTX();
                    if (ctx) {
                        let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;
                        let y = graph.Y(tgraph.Y(yv - 1)) + 10;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.arc(x, y, radius, 0, 2 * Math.PI);
                        ctx.fillStyle = 'white';
                        ctx.fill();
                        ctx.stroke();
                        ctx.closePath();

                        var number = annotation.index;
                        ctx.font = '8px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = 'black';
                        ctx.fillText(number, x, y);
                        ctx.restore();

                    }

                } else {
                    var radius = 20;
                    let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;
                    let yr = graph.Y(tgraph.Y(yv));

                    ctx.beginPath();
                    ctx.arc(x, yr, radius, 0, 2 * Math.PI);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    ctx.stroke();
                    ctx.closePath();

                    var number = annotation.index;
                    ctx.font = '15px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = 'black';
                    ctx.fillText(number, x, yr);
                    ctx.restore();

                }
            }
        }),
        'TSS': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'lightGreen', 40, 'butt'
            );

            drawLine(ctx,
                graph.X(tgraph.X(xs)) - 1, graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xs)) + 1, graph.Y(tgraph.Y(y)),
                'blue', 4, 'butt'
            );

            drawLine(ctx,
                graph.X(tgraph.X(xf)) - 1, graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)) + 1, graph.Y(tgraph.Y(y)),
                'blue', 4, 'butt'
            );
        }),
        'STOP': createIon((ctx, graph, tgraph, xs, xf, y) => {

            let screencell = graph.screenWidth(tgraph.screenWidth(1))
            if (screencell < 0.05) {
                return;
            }
            drawLine(ctx, graph.X(xs) - 1, graph.Y(y), graph.X(xs) + 1, graph.Y(y), 'blue', 10, 'butt')
            drawLine(ctx, graph.X(xf) - 1, graph.Y(y), graph.X(xf) + 1, graph.Y(y), 'blue', 10, 'butt')
            drawString45(ctx, 'TC', xf - 0.5, y + 1, 'gray', '10px Arial')

        }),
        'oligo': createIon((ctx, graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, 'green', 1, 'butt')

        }),
        'ProteinDomain': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            drawLine(
                ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y + 1)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y + 1)),
                'lightBlue', 20, 'butt'
            );

            drawLine(
                ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y + 1)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y + 1)),
                'yellow', 5, 'butt'
            );

            drawLine(
                ctx,
                (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y)),
                (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y + 1)),
                'blue', 4, 'butt'
            );

            drawLine(
                ctx,
                (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y)),
                (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y + annotation.labelY - 2)),
                'yellow', 1, 'butt'
            );

            drawString(ctx,
                annotation.name,
                (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2,
                graph.Y(tgraph.Y(y + annotation.labelY - 2)),
                'black',
                '10px Arial'
            );

            let screencell = graph.screenWidth(tgraph.screenWidth(1))
            if (screencell < 1.5 && screencell > 0.1) {
                if (annotation.description != null && annotation.description.length > 0) {
                    drawLine(ctx,
                        (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y)),
                        (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y)),
                        'black', 1, 'butt'
                    );
                    drawString(ctx,
                        annotation.description,
                        (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2,
                        graph.Y(tgraph.Y(y + annotation.labelY - 2)),
                        'black',
                        '10px Arial'
                    );
                }

            }

        }),
        'amplicon': createIon((graph, tgraph, xs, xf, y, color, annotation) => {

        }),
        'aso': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(
                ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'green', 1, 'butt'
            );

        }), 'AA': createIon((ctx, graph, tgraph, xs, xf, y, color, annotation) => {

            let screencell = graph.screenWidth(tgraph.screenWidth(1))

            drawLine(
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'rgba(200,0,0,0.5)', 65, 'butt'
            );

            drawLine(
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y + annotation.labelY - 1)),
                'lightGray', 1, 'butt'
            );

            if (screencell > 0.5) {
                drawString(
                    annotation.name,
                    graph.X(tgraph.X(xs)),
                    graph.Y(tgraph.Y(y + annotation.labelY - 1)),
                    'black',
                    '10px Arial'
                );
            }

        }),

        'Translation': createIon((ctx, graph, tgraph, xs, xf, y) => {
            let screencell = graph.screenWidth(tgraph.screenWidth(1))
            if (screencell < 0.05) {
                return;
            }
            let r = 0.1;

            drawString(ctx,
                'START',
                graph.X(tgraph.X(xs)),
                graph.Y(tgraph.Y(y + r)),
                'black',
                '9px Arial'
            );

            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)),
                graph.Y(tgraph.Y(y)),
                0.2,
                'green',
                4
            );

            drawString(ctx,
                'STOP',
                graph.X(tgraph.X(xf - 1)),
                graph.Y(tgraph.Y(y + r)),
                'black',
                '9px Arial'
            );

            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)),
                graph.Y(tgraph.Y(y)),
                0.2,
                'red',
                4
            );

        }),
        'CODON': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'lightGray', 3, 'butt'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, 'gray'
            );
        }),
        'CDS': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf + 1)), graph.Y(tgraph.Y(y)),
                'rgba(0,0,250,0.4)', 20
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.08, 'blue', 1
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf + 1)), graph.Y(tgraph.Y(y)),
                0.08, 'blue', 1
            );
        }),
        'UTR': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'lightBlue', 7
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, 'lightBlue'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, 'lightBlue'
            );
        }),
        'polypeptide': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'lightGray', 1
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, 'lightGray'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, 'lightGray'
            );
        }),
        'rna-binding': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawZigZag(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'orange', 4, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, 'black'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, 'black'
            );
        }),
        'snp': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawZigZag(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'purple', 20, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, 'black'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, 'black'
            );
        }),
        'Query': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'purple', 12, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, 'black'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, 'black'
            );
        }),
        'Query-Target': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'orange', 12, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, 'black'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, 'black'
            );
        }),
        'biological_region': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'magenta', 5
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, 'magenta'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, 'magenta'
            );
        }),
        'region': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'darkGray', 2, 'butt'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.1, 'darkGray'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.1, 'darkGray'
            );
        }),
        'polyA': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'darkCyan', 25, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                1.1, 'lightGray'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                1.1, 'lightGray'
            );
        }),
        'lncRNA': createIon((ctx, graph, tgraph, xs, xf, y, color, annotation) => {
            let screencell = graph.screenWidth(tgraph.screenWidth(1));
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y + 0.3)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y + 0.3)),
                'darkCyan', 25, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y + 0.3)),
                1.1, 'magenta'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y + 0.3)),
                1.1, 'magenta'
            );
            let name = 'lncRNA'
            if (screencell > 0.01 && annotation.name) {
                name = annotation.name;
            }
            let r = 0.35;
            drawString(ctx,
                name,
                graph.X(tgraph.X(xs)),
                graph.Y(tgraph.Y(y + 1 + r)),
                'black',
                '10px Arial'
            );
        }),

    }

}
