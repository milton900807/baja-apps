function (pm, grid, start_date, end_date) {

    return new Promise(async (res, rej) => {
        let { Track, TrackRef } = await exec('baja/bio/track-flexi.js')

        let color = 'rgba(30,30,100,0.4)';
        let cursorPos = 0;
        const platetrack = pm.plateTrack;
        function formatTime(x, xMin, xMax, start, end) {
            const totalCanvasRange = xMax - xMin;
            const totalTimeRange = end.getTime() - start.getTime();
            const normalizedX = (x - xMin) / totalCanvasRange;
            const date = new Date(start.getTime() + normalizedX * totalTimeRange);
            return date;
        }

        if (!grid) {
            if (!start_date) {
                start_date = new Date();
            }

            if (!end_date) {
                end_date = new Date();
                end_date.setFullYear(start_date.getFullYear() + 1);
            }
        }

        let hd = {
            startX: null,
            startY: null,
            currentX: null,
            currentY: null,
            isDrawing: true,

            id: 'override-arrow-draw',
            draw: (grid, ctx) => {

                if (hd.startX !== null && hd.startY !== null) {
                    hd.drawArrow(ctx, hd.startX, hd.startY, hd.currentX, hd.currentY, {
                        color: color,
                        lineWidth: 15,
                        headSize: 25
                    });

                }
            },
            drawArrow: (ctx, startX, startY, endX, endY, options = {}) => {
                const {
                    color = "black",
                    lineWidth = 2,
                    headSize = 10
                } = options;

                if (hd.startX !== null && hd.startY !== null) {
                    const rectWidth = hd.currentX - hd.startX;
                    const rectHeight = hd.currentY - hd.startY
                    ctx.fillStyle = 'rgba(10,10,200,0.4)';
                    ctx.fillRect(hd.startX, hd.startY, rectWidth, rectHeight);
                }

                const angle = Math.atan2(endY - startY, endX - startX);

                const headLengthX = headSize * Math.cos(angle);
                const headLengthY = headSize * Math.sin(angle);

                const lineEndX = endX - headLengthX;
                const lineEndY = endY - headLengthY;

                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.fillStyle = color;
                ctx.lineWidth = lineWidth;

                ctx.moveTo(startX, startY);
                ctx.lineTo(lineEndX, lineEndY);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(endX, endY);
                ctx.lineTo(
                    endX - headSize * Math.cos(angle - Math.PI / 6),
                    endY - headSize * Math.sin(angle - Math.PI / 6)
                );
                ctx.lineTo(
                    endX - headSize * Math.cos(angle + Math.PI / 6),
                    endY - headSize * Math.sin(angle + Math.PI / 6)
                );
                ctx.lineTo(endX, endY);
                ctx.closePath();
                ctx.fill();

                ctx.restore();
            },

            keydown: (event) => {
                if (event.key === 'Enter') {
                    console.log('Enter key pressed');
                } else {
                    if (/^[a-zA-Z0-9!.\-%$*&#@()\[\]{}]$/.test(event.key)) {
                        cursorPos += 1;
                    } else {
                        console.log('----Non-alphanumeric key pressed: ' + event.key);
                    }
                }
            },
            mouseDownListener: async (x, y) => {
                hd.startX = x;
                hd.startY = y;
                hd.currentX = x;
                hd.currentY = y;

                if (grid) {
                    let mdate = grid.Xwc(x + grid.xi * 2)
                    let date = formatTime(mdate, grid.xmin, grid.xmax, start_date, end_date)
                    if (!start_date) {
                        start_date = date;
                    }
                    this.track = new Track()
                }
            },

            mouseMoveListener: (x, y) => {
                if (hd.isDrawing) {
                    hd.currentX = x;
                    hd.currentY = y;
                }
            },

            mouseUpListener: async (x, y) => {

                const sequence = 'ACTACTACTADCTACTCTACTACTACTACTACTAGACTAGATAGATACTAGGATACTAGA'

                let plot = new Track("seqo.description", 0, sequence.length, 0, 1)
                plot.sequence = sequence;
                plot.grid.xmax =  ( sequence.length )
                plot.grid.xmin = 0
                plot.grid.ymax = 1;
                plot.grid.ymin = -1;
                plot.setWidth((400))
                plot.setHeight((200))
                pm.plateTrack.m_plots.push(plot)
                plot.grid.xi = pm.plateTrack.grid.Xwc(x)
                plot.grid.yi = pm.plateTrack.grid.Ywc(y)
                hd.startX = null;
                hd.startY = null;
                hd.currentX = null;
                hd.currentY = null;
                pm.plateTrack.wb(null)
                hd.startX = null;
                hd.startY = null;
                hd.currentX = null;
                hd.currentY = null;
                },
            close: () => {
            },
        };

        pm.plateTrack.setMessage(" Click and drag a rectangle on the canvas ")

        pm.plateTrack.wb(hd)
        hd.startX = null;
        hd.startY = null;
        hd.currentX = null;
        hd.currentY = null;

        res ();

    })

}
