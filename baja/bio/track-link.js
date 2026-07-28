return new Promise(async (resolve, reject) => {
    let TrackLink = class TrackLink {
        name = 'untitled';
        track1;
        track2;
        visible = true;
        alpha = 1;
        line_width = 1;
        label = 'unknown';
        mode;
        value;
        color;
        r = Math.random();

        constructor(t1, t2) {
            if (t1 && t1) {
                this.track1 = t1;
                if (!this.track1.id) {
                    this.track1.id = t1.track.id;
                }
                this.track2 = t2;
                if (!this.track2.id) {
                    this.track2.id = t2.track.id;
                }
            }
        }

        setValue(value) {
            this.value = value;
        }

        getColor(value) {

            value = value / 100.0

            value = Math.min(1, Math.max(0, value));

            const logValue = Math.pow(10, value);

            const greenValue = Math.round(255 * logValue);
            const grayValue = Math.round(192 + (63 * (1 - logValue)));

            const color = `rgb(0, ${greenValue}, ${grayValue})`;
            return color;

        }

        draw(graph) {
            if (!this.visible) {
                return;
            }

            if (this.value === undefined) {
                this.value = this.alpha;
            }

            let canvas = graph.canvas;
            let ctx = canvas.getCTX();
            ctx.shadowColor = "#000000";
            ctx.shadowBlur = 0;
            let screencell = Math.abs(graph.screenWidth((1)))

            if (this.mode && this.mode === 'rect') {
                ctx.lineWidth = this.line_width;
                ctx.lineCap = 'butt';
                ctx.strokeStyle = `rgba(100,100,200,${this.alpha})`;
                ctx.fillStyle = `rgba(100,0,0,${this.alpha})`;

                if (this.color) {
                    ctx.fillStyle = this.color;
                    ctx.strokeStyle = this.color;
                }

                let startX = graph.X(this.track1.track.tgraph.X((this.track1.xi + this.track1.xf) / 2));
                let startY = graph.Y(this.track1.track.tgraph.Y(this.track1.y));
                let endX = graph.X(this.track2.track.tgraph.X((this.track2.xi + this.track2.xf) / 2));
                let endY = graph.Y(this.track2.track.tgraph.Y(this.track2.y));
                const midX = (startX + endX) / 2;
                const midY = (startY + endY) / 2;

                const textWidth = ctx.measureText(this.label).width;
                const radius = textWidth / 2 + 10;

                ctx.beginPath();

                let xisc = graph.X(this.track1.track.tgraph.X(this.track1.xi));
                let yisc = graph.Y(this.track1.track.tgraph.Y(0));
                let xfsc = graph.X(this.track1.track.tgraph.X(this.track1.xf));

                let xisc2 = graph.X(this.track2.track.tgraph.X(this.track2.xi));
                let yisc2 = graph.Y(this.track2.track.tgraph.Y(0));
                let xfsc2 = graph.X(this.track2.track.tgraph.X(this.track2.xf));
                ctx.moveTo(xisc, yisc)
                ctx.lineTo(xfsc, yisc);
                ctx.lineTo(xfsc2, yisc2);
                ctx.lineTo(xisc2, yisc2);

                ctx.closePath();
                ctx.fill();

                let xmin = xisc;
                let xmax = xfsc2;
                if (xisc < xfsc)
                    xmin = xisc;
                if (xfsc < xmin)
                    xmin = xfsc
                if (xisc2 < xmin)
                    xmin = xisc2
                if (xfsc2 < xmin)
                    xmin = xfsc2

                if (xisc > xmax)
                    xmax = xisc;
                if (xfsc > xmax)
                    xmax = xfsc
                if (xisc2 > xmax)
                    xmax = xisc2;
                if (xfsc2 > xmax)
                    xmax = xfsc2

                let xmid = xfsc2;
                let ymid = yisc2;

                if (this.label) {
                    ctx.font = "12px Arial";
                    ctx.shadowColor = "#000000";
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = "black";
                    ctx.fillText(this.label, xmid, ymid);
                    ctx.beginPath();
                    ctx.moveTo(startX, startY);
                    ctx.lineTo(endX, endY);
                    ctx.stroke();

                    ctx.shadowBlur = 0;
                    ctx.beginPath();
                    ctx.arc(midX, midY, radius, 0, 2 * Math.PI, false);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = 'lightGray';
                    ctx.stroke();
                    ctx.fillStyle = 'black';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(this.label + '', midX, midY);

                }

            } else {
                try {
                    let startX = graph.X(this.track1.track.tgraph.X((this.track1.xi + this.track1.xf) / 2));
                    let startY = graph.Y(this.track1.track.tgraph.Y(this.track1.y));
                    let endX = graph.X(this.track2.track.tgraph.X((this.track2.xi + this.track2.xf) / 2));
                    let endY = graph.Y(this.track2.track.tgraph.Y(this.track2.y));
                    const midX = (startX + endX) / 2;
                    const midY = (startY + endY) / 2;

                    const textWidth = ctx.measureText(this.label).width;
                    const radius = textWidth / 2 + 10;

                    ctx.beginPath();

                    let xisc = graph.X(this.track1.track.tgraph.X(this.track1.xi));
                    let yisc = graph.Y(this.track1.track.tgraph.Y(0));
                    let xfsc = graph.X(this.track1.track.tgraph.X(this.track1.xf));

                    let xisc2 = graph.X(this.track2.track.tgraph.X(this.track2.xi));
                    let yisc2 = graph.Y(this.track2.track.tgraph.Y(0));
                    let xfsc2 = graph.X(this.track2.track.tgraph.X(this.track2.xf));
                    ctx.moveTo(xisc, yisc)
                    ctx.lineTo(xfsc, yisc);
                    ctx.lineTo(xfsc2, yisc2);
                    ctx.lineTo(xisc2, yisc2);

                    ctx.closePath();
                    ctx.fill();

                    ctx.font = "12px Arial";
                    ctx.shadowColor = "#000000";
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = "black";
                    ctx.fillText(this.label, xmid, ymid);
                    ctx.beginPath();
                    ctx.moveTo(startX, startY);
                    ctx.lineTo(endX, endY);
                    ctx.stroke();

                    ctx.shadowBlur = 0;
                    ctx.beginPath();
                    ctx.arc(midX, midY, radius, 0, 2 * Math.PI, false);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = 'blue';
                    ctx.stroke();
                    ctx.fillStyle = 'black';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(this.label + '', midX, midY);

                } catch (exception) {
                    console.log(' ex ' + exception)
                }
            }

        }
    }
    resolve(TrackLink);
});
