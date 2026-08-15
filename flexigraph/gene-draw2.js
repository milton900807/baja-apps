function () {

    const drawString45 = (ctx, str, x, y, color, font) => {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        if (!font) {
            font = "12px system-ui, -apple-system, Roboto, Arial, sans-serif";
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = '#1f2937';
        if (!color) {
            color = '#1f2937'
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
            font = "15px system-ui, -apple-system, Roboto, Arial, sans-serif";
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = '#1f2937';
        if (!color) {
            color = '#1f2937'
        }
        if (font) {
            ctx.font = font;
        } else {
            ctx.font = '15px system-ui, -apple-system, Roboto, Arial, sans-serif'
        }
        ctx.fillStyle = color;
        let sx = (x);
        let sy = (y) - 5;

        ctx.fillText(str, sx, sy);
        ctx.stroke();

    }

    const drawLine = (ctx, xi, yi, xf, yf, color, lineSize, lineCap) => {
        ctx.shadowBlur = 0;
        ctx.shadowColor = '#1f2937';
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
        ctx.shadowColor = '#1f2937';
        ctx.lineWidth = lineSize;

        ctx.beginPath();
        ctx.moveTo((xi), (yi));
        ctx.lineTo((xf), (yf));
        ctx.stroke();
    }

    const drawVerticalLine = (ctx, x, y, vlength, color, lineWidth) => {
        ctx.shadowBlur = 0;
        ctx.shadowColor = '#1f2937';
        if (color != null) {
            ctx.strokeStyle = color;
        } else {
            ctx.strokeStyle = '#c77d34'
        }
        if (!lineWidth) {
            ctx.lineWidth = 1;
        } else
            ctx.lineWidth = lineWidth;
        ctx.shadowBlur = 0;
        ctx.shadowColor = '#1f2937';

        ctx.beginPath();
        ctx.moveTo((x), (y - vlength / 2));
        ctx.lineTo((x), (y + (vlength / 2)));
        ctx.stroke();
    }

    return {
        'UserAnnotation': createIon((ctx, grid, tgraph, xs, xf, y, color, annotation) => {
            color = annotation.color;
            rawVerticalLine(ctx, grid.X(tgraph.X(xs)), grid.Y(tgraph.Y(y)), 0.13, '#93b4d8', 0.5);
            drawVerticalLine(ctx, grid.X(tgraph.X(xf)), grid.Y(tgraph.Y(y)), 0.13, '#93b4d8', 0.7);
            drawLine(ctx, grid.X(tgraph.X(xs)), grid.Y(tgraph.Y(y)), grid.X(tgraph.X(xf)), grid.Y(tgraph.Y(y)), color, 13, 'butt');

        }),

        'Acceptor-Splice-Site': createIon((ctx, graph, tgraph, xss, xff, __y, color, annotation) => {
            var radius = 10;
            let xs = xss - 1;
            let xf = xff - 1;
            drawVerticalLine(graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(__y)), 0.63, '#93b4d8', 0.5)

            drawVerticalLine(graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(__y)), 0.63, '#93b4d8', 0.7)
            let x = (grid.X(xs) + graph.X(xf)) / 2;
            let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
            if (screencell > 4) {

                let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;

                ctx.shadowBlur = 2;
                ctx.shadowColor = '#1f2937';

                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(x, graph.Y(tgraph.Y(__y)) + 10, radius, 0, 2 * Math.PI);
                ctx.fillStyle = 'white';
                ctx.fill();
                ctx.stroke();
                ctx.closePath();
                ctx.shadowBlur = 0;
                ctx.font = '13px system-ui, -apple-system, Roboto, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#1f2937'

                ctx.fillText("A", x, graph.Y(tgraph.Y(__y)) + 10);
                ctx.textAlign = 'left'
            }
        }),
        'Acceptor-Splice-Site.highlight': createIon((ctx, graph, tgraph, xss, xff, __y, color, annotation) => {
            var radius = 10;
            let xs = xss - 1;
            let xf = xff - 1;

            graph.drawVerticalLine(xs, __y, 0.63, '#93b4d8', 0.5)
            graph.drawVerticalLine(xf, __y, 0.63, '#93b4d8', 0.7)
            let x = (graph.X(xs) + graph.X(xf)) / 2;
            var ctx = graph.canvas.getCTX();

            if (ctx) {
                ctx.shadowBlur = 7;
                ctx.shadowColor = '#1f2937';
                ctx.lineWidth = 3;

                ctx.color = '#274b86'
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

                    ctx.font = '13px system-ui, -apple-system, Roboto, Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#1f2937'
                    ctx.fillText("A", x, graph.Y(__y) + 10);
                    ctx.textAlign = 'left'

                }
            }
        }),
        'Donor-Splice-Site': createIon((ctx, graph, tgraph, xss, xff, y, color, annotation) => {
            var radius = 10;
            let xs = xss - 1;
            let xf = xff - 1;
            graph.drawVerticalLine(graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(__y)), 0.63, '#93b4d8', 0.5);
            graph.drawVerticalLine(graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(__y)), 0.63, '#93b4d8', 0.7);
            let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;
            ctx.shadowBlur = 7;
            ctx.shadowColor = '#1f2937';
            ctx.lineWidth = 3;

            ctx.color = '#274b86'
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

                ctx.font = '13px system-ui, -apple-system, Roboto, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#1f2937'
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

            graph.drawVerticalLine(graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)), 0.13, '#7a6fa6', 0.7);
            graph.drawVerticalLine(graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)), 0.13, '#7a6fa6', 0.4);

            let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;
            ctx.shadowBlur = 7;
            ctx.shadowColor = '#1f2937';
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

                ctx.font = '13px system-ui, -apple-system, Roboto, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#1f2937'

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

            graph.drawVerticalLine(graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)), 0.63, '#a03b2e', 0.5);
            graph.drawVerticalLine(graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)), 0.63, '#a03b2e', 0.5);

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

                ctx.font = '10px system-ui, -apple-system, Roboto, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#1f2937'
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
                        ctx.font = '8px system-ui, -apple-system, Roboto, Arial, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = '#1f2937';
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
                    ctx.font = '15px system-ui, -apple-system, Roboto, Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#1f2937';
                    ctx.fillText(number, x, yr);
                    ctx.restore();

                }
            }
        }),
        'TSS': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'rgba(78,157,105,0.55)', 40, 'butt'
            );

            drawLine(ctx,
                graph.X(tgraph.X(xs)) - 1, graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xs)) + 1, graph.Y(tgraph.Y(y)),
                '#3e7cb1', 4, 'butt'
            );

            drawLine(ctx,
                graph.X(tgraph.X(xf)) - 1, graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)) + 1, graph.Y(tgraph.Y(y)),
                '#3e7cb1', 4, 'butt'
            );
        }),
        'STOP': createIon((ctx, graph, tgraph, xs, xf, y) => {

            let screencell = graph.screenWidth(tgraph.screenWidth(1))
            if (screencell < 0.05) {
                return;
            }
            drawLine(ctx, graph.X(xs) - 1, graph.Y(y), graph.X(xs) + 1, graph.Y(y), '#3e7cb1', 10, 'butt')
            drawLine(ctx, graph.X(xf) - 1, graph.Y(y), graph.X(xf) + 1, graph.Y(y), '#3e7cb1', 10, 'butt')
            drawString45(ctx, 'TC', xf - 0.5, y + 1, '#8a94a6', '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

        }),
        'oligo': createIon((ctx, graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#2e9e6b', 1, 'butt')

        }),
        'ProteinDomain': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            drawLine(
                ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y + 1)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y + 1)),
                '#93b4d8', 20, 'butt'
            );

            drawLine(
                ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y + 1)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y + 1)),
                '#c9a227', 5, 'butt'
            );

            drawLine(
                ctx,
                (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y)),
                (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y + 1)),
                '#3e7cb1', 4, 'butt'
            );

            drawLine(
                ctx,
                (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y)),
                (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y + annotation.labelY - 2)),
                '#c9a227', 1, 'butt'
            );

            drawString(ctx,
                annotation.name,
                (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2,
                graph.Y(tgraph.Y(y + annotation.labelY - 2)),
                '#1f2937',
                '10px system-ui, -apple-system, Roboto, Arial, sans-serif'
            );

            let screencell = graph.screenWidth(tgraph.screenWidth(1))
            if (screencell < 1.5 && screencell > 0.1) {
                if (annotation.description != null && annotation.description.length > 0) {
                    drawLine(ctx,
                        (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y)),
                        (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y)),
                        '#1f2937', 1, 'butt'
                    );
                    drawString(ctx,
                        annotation.description,
                        (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2,
                        graph.Y(tgraph.Y(y + annotation.labelY - 2)),
                        '#1f2937',
                        '10px system-ui, -apple-system, Roboto, Arial, sans-serif'
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
                '#2e9e6b', 1, 'butt'
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
                'rgba(120,130,145,0.45)', 1, 'butt'
            );

            if (screencell > 0.5) {
                drawString(
                    annotation.name,
                    graph.X(tgraph.X(xs)),
                    graph.Y(tgraph.Y(y + annotation.labelY - 1)),
                    '#1f2937',
                    '10px system-ui, -apple-system, Roboto, Arial, sans-serif'
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
                '#1f2937',
                '9px system-ui, -apple-system, Roboto, Arial, sans-serif'
            );

            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)),
                graph.Y(tgraph.Y(y)),
                0.2,
                '#2e9e6b',
                4
            );

            drawString(ctx,
                'STOP',
                graph.X(tgraph.X(xf - 1)),
                graph.Y(tgraph.Y(y + r)),
                '#1f2937',
                '9px system-ui, -apple-system, Roboto, Arial, sans-serif'
            );

            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)),
                graph.Y(tgraph.Y(y)),
                0.2,
                '#c0504d',
                4
            );

        }),
        'CODON': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'rgba(120,130,145,0.45)', 3, 'butt'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, '#8a94a6'
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
                0.08, '#3e7cb1', 1
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf + 1)), graph.Y(tgraph.Y(y)),
                0.08, '#3e7cb1', 1
            );
        }),
        'UTR': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                '#93b4d8', 7
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, '#93b4d8'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, '#93b4d8'
            );
        }),
        'polypeptide': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'rgba(120,130,145,0.45)', 1
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, 'rgba(120,130,145,0.45)'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, 'rgba(120,130,145,0.45)'
            );
        }),
        'rna-binding': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawZigZag(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                '#c77d34', 4, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, '#1f2937'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, '#1f2937'
            );
        }),
        'snp': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawZigZag(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                '#6e5aa6', 20, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, '#1f2937'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, '#1f2937'
            );
        }),
        'Query': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                '#6e5aa6', 12, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, '#1f2937'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, '#1f2937'
            );
        }),
        'Query-Target': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                '#c77d34', 12, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, '#1f2937'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, '#1f2937'
            );
        }),
        'biological_region': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                '#7a6fa6', 5
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, '#7a6fa6'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, '#7a6fa6'
            );
        }),
        'region': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                '#8a8f98', 2, 'butt'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.1, '#8a8f98'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.1, '#8a8f98'
            );
        }),
        'polyA': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                '#3c8dbc', 25, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                1.1, 'rgba(120,130,145,0.45)'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                1.1, 'rgba(120,130,145,0.45)'
            );
        }),
        'lncRNA': createIon((ctx, graph, tgraph, xs, xf, y, color, annotation) => {
            let screencell = graph.screenWidth(tgraph.screenWidth(1));
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y + 0.3)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y + 0.3)),
                '#3c8dbc', 25, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y + 0.3)),
                1.1, '#7a6fa6'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y + 0.3)),
                1.1, '#7a6fa6'
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
                '#1f2937',
                '10px system-ui, -apple-system, Roboto, Arial, sans-serif'
            );
        }),

    }

}
