function () {
    return new Promise(async (resolve, reject) => {
        let Gears = class Gears {
            x;
            y;
            r = 1;
            teeth = 12;
            color = '#999999';
            innerColor = '#666666';
            type = 'Gears';
            hl = false;
            comment = '';
            rotation = 0;

            constructor(x, y, r, teeth = 12, color) {
                this.x = x;
                this.y = y;
                this.r = r;
                this.teeth = teeth;
                if (color) this.color = color;
            }

            setColor(color) {
                this.color = color;
            }

            move(x, y) {
                if (!x || !y) return;
                this.x = x;
                this.y = y;
            }

            highlight(v) {
                this.hl = v;
            }

            draw(graph, ctx) {
                const cx = graph.X(this.x);
                const cy = graph.Y(this.y);
                const radius = graph.screenWidth(this.r);
                const toothWidth = (2 * Math.PI) / this.teeth;
                const outerRadius = radius * 1.1;
                const innerRadius = radius * 0.85;

                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(this.rotation);

                ctx.beginPath();
                for (let i = 0; i < this.teeth; i++) {
                    const angle = i * toothWidth;
                    const nextAngle = angle + toothWidth / 2;

                    const x1 = Math.cos(angle) * outerRadius;
                    const y1 = Math.sin(angle) * outerRadius;
                    const x2 = Math.cos(nextAngle) * innerRadius;
                    const y2 = Math.sin(nextAngle) * innerRadius;

                    if (i === 0) ctx.moveTo(x1, y1);
                    else ctx.lineTo(x1, y1);

                    ctx.lineTo(x2, y2);
                }
                ctx.closePath();
                ctx.fillStyle = this.color;
                ctx.strokeStyle = '#444';
                ctx.lineWidth = 2;
                ctx.fill();
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(0, 0, radius * 0.3, 0, 2 * Math.PI);
                ctx.fillStyle = this.innerColor;
                ctx.fill();
                ctx.stroke();

                if (this.comment) {
                    ctx.fillStyle = 'black';
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(this.comment, 0, -radius - 10);
                }

                ctx.restore();
            }

            updateRotation(delta) {
                this.rotation += delta;
            }
        }

        resolve(Gears);
    });
}
