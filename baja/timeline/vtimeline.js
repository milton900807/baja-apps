function () {
    return new Promise(async (resolve, reject) => {

        let MGrid = await exec('flexigraph/grid.js')

        let xmax = 10;
        let ymax = 1000;
        let ymin = 0;
        let xmin = 0;

        class VerticalTimeline {
            events = [];
            timeIntervals = []
            grid;
            msg = null;
            msgy = -1;

            constructor(startDate, endDate) {

                this.grid = new MGrid(0, 0, 100, 400);
                this.grid.xi = 0;
                this.grid.yi = 0;
                this.grid.width = 300;
                this.grid.setxmax(xmax);
                this.grid.setymax(ymax);
                this.grid.setxmin(xmin);
                this.grid.setymin(ymin);
                this.grid.setInset(50, 20)
                this.grid.rescale();

                this.startDate = new Date(startDate);
                this.endDate = new Date(endDate);
                this.months = (this.endDate.getFullYear() - this.startDate.getFullYear()) * 12 +
                    (this.endDate.getMonth() - this.startDate.getMonth()) + 1;

                this.timeIntervals = [
                    { start: '2024-05-10', end: '2024-06-01', color: 'orange', text: 'Screening design' },
                    { start: '2024-08-11', end: '2024-08-25', color: 'green', text: 'Synthesis' },
                    { start: '2024-05-01', end: '2024-07-10', color: 'green', text: 'Assay development' },
                    { start: '2024-05-01', end: '2024-08-10', color: 'green', text: 'Cell culture' },
                    { start: '2024-09-01', end: '2024-09-25', color: 'green', text: 'Primary screen' },
                    { start: '2024-10-03', end: '2024-10-30', color: 'green', text: 'Dose response screen' },
                    { start: '2024-10-20', end: '2024-11-01', color: 'blue', text: 'In vitro Tox' },
                    { start: '2024-05-20', end: '2024-11-01', color: 'blue', text: 'In vivo (eval)' },
                    { start: '2024-11-10', end: '2025-02-25', color: 'green', text: 'Rodant tox' },
                    { start: '2024-11-10', end: '2024-11-25', color: 'blue', text: 'In vivo PK/PD' },
                    { start: '2024-09-10', end: '2025-02-25', color: 'red', text: 'Clinical plan' },
                    { start: '2024-11-10', end: '2025-02-25', color: 'red', text: 'CMC' },

                ];

                this.events = [];
            }

            dateTimeToScreenY(date) {
                this.grid.rescale();

                let monthDiff = (date.getFullYear() - this.startDate.getFullYear()) * 12 + (date.getMonth() - this.startDate.getMonth());
                let daysInGivenMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
                let dayFraction = (date.getDate() - 1) / daysInGivenMonth;

                let totalProgress = monthDiff + dayFraction;

                let totalWorldHeight = this.grid.getymax() - this.grid.getymin();
                let worldY = this.grid.getymin() + totalProgress * totalWorldHeight / this.months;

                let screenY = this.grid.Y(worldY);

                return screenY;
            }

            screenToDateTime(screenY) {
                this.grid.rescale()

                let worldY = this.grid.Ywc(screenY);

                let totalWorldHeight = this.grid.getymax() - this.grid.getymin();
                let progress = (worldY - this.grid.getymin()) / totalWorldHeight;

                let totalMonthsFromStart = progress * this.months;

                let wholeMonths = Math.floor(totalMonthsFromStart);
                let fractionalMonth = totalMonthsFromStart - wholeMonths;

                let daysInMonth = new Date(this.startDate.getFullYear(), this.startDate.getMonth() + wholeMonths + 1, 0).getDate();
                let daysFromFraction = Math.round(fractionalMonth * daysInMonth);

                let resultDate = new Date(this.startDate.getFullYear(), this.startDate.getMonth(), 1);
                resultDate.setMonth(resultDate.getMonth() + wholeMonths);
                resultDate.setDate(resultDate.getDate() + daysFromFraction - 1);

                return resultDate;
            }

            drawTimeline(canvas) {
                if (canvas) {
                    let ctx = canvas.getCTX();

                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    const lineHeight = canvas.height / this.months;
                    if (this.grid) {
                        this.grid.width = canvas.width;
                        this.grid.height = canvas.height;

                        this.grid.rescale()
                    }
                    ctx.globalAlpha = 0.1;
                    ctx.beginPath();
                    ctx.moveTo(canvas.width / 2, canvas.height);
                    ctx.lineTo(canvas.width / 2 - 40, 40);
                    ctx.lineTo(canvas.width / 2, 0);
                    ctx.lineTo(canvas.width / 2 + 40, 40);
                    ctx.lineTo(canvas.width / 2, canvas.height);
                    ctx.fillStyle = 'blue';
                    ctx.fill();
                    if (this.months > 0) {
                        ctx.globalAlpha = 0.3;

                        for (let i = 0; i <= this.months; i++) {
                            let date = new Date(this.startDate.getFullYear(), this.startDate.getMonth() + i, 1);
                            let screenY = this.dateTimeToScreenY(date);

                            let dateString;
                            if (date.getMonth() === 0) {
                                dateString = date.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
                            } else {
                                dateString = date.toLocaleDateString('default', { month: 'short', day: 'numeric' });
                            }

                            ctx.fillStyle = 'black';
                            ctx.font = '11px Arial';
                            ctx.fillText(dateString, this.grid.X(this.grid.getxmin()) + 5, screenY - 5);
                        }

                        let tracks = [];
                        ctx.globalAlpha = 1.0;

                        const findOrCreateTrack = (startDate, endDate) => {
                            for (let i = 0; i < tracks.length; i++) {
                                let track = tracks[i];
                                if (!track.some(interval =>
                                    (new Date(interval.start) <= endDate && new Date(interval.end) >= startDate))) {
                                    return track;
                                }
                            }
                            let newTrack = [];
                            tracks.push(newTrack);
                            return newTrack;
                        };

                        this.timeIntervals.forEach(interval => {
                            const startDate = new Date(interval.start);
                            const endDate = new Date(interval.end);
                            const track = findOrCreateTrack(startDate, endDate);
                            track.push(interval);
                        });

                        tracks.forEach((track, trackIndex) => {
                            const trackHeight = 20;
                            track.forEach(interval => {
                                const startDate = new Date(interval.start);
                                const endDate = new Date(interval.end);

                                const startY = this.dateTimeToScreenY(startDate);
                                const endY = this.dateTimeToScreenY(endDate);

                                const blockWidth = (this.grid.getxmax() - this.grid.getxmin()) / tracks.length;

                                ctx.fillStyle = interval.color;
                                ctx.fillRect(
                                    this.grid.X(1 + this.grid.getxmin() + blockWidth * trackIndex),
                                    Math.min(startY, endY),
                                    blockWidth,
                                    Math.abs(endY - startY)
                                );

                                ctx.fillStyle = 'black';
                                ctx.font = '12px Arial';
                                let textY = (Math.min(startY, endY) + Math.abs(endY - startY) / 2) + 6;
                                ctx.fillText(interval.text, this.grid.X(1 + this.grid.getxmin() + blockWidth * trackIndex) + 5, textY);

                            });
                        });

                        this.events.forEach(event => {
                            const date = new Date(event.date);
                            const screenEventY = this.dateTimeToScreenY(date);
                            ctx.beginPath();
                            ctx.arc(this.grid.X((this.grid.getxmin() + this.grid.getxmax()) / 2), screenEventY, 5, 0, 2 * Math.PI);
                            ctx.fill();
                            const centerX = this.grid.X((this.grid.getxmin() + this.grid.getxmax()) / 2);
                            const textX = centerX + 10;
                            const textY = screenEventY + 3;

                            ctx.font = '12px Arial';
                            const text = event.label;
                            const metrics = ctx.measureText(text);
                            const textWidth = metrics.width;
                            const textHeight = parseInt(ctx.font, 10);

                            ctx.fillStyle = 'white';
                            ctx.fillRect(textX - 2, textY - textHeight, textWidth + 4, textHeight + 4);

                            ctx.fillStyle = 'black';
                            ctx.beginPath();
                            ctx.arc(centerX, screenEventY, 5, 0, 2 * Math.PI);
                            ctx.fill();

                            ctx.fillText(event.label, this.grid.X((this.grid.getxmin() + this.grid.getxmax()) / 2) + 10, screenEventY + 3);
                        });

                    }

                    if (this.msg && this.msgy) {
                        const textWidth = ctx.measureText(this.msg).width;
                        ctx.fillStyle = 'black';
                        ctx.fillText(this.msg, this.grid.X(this.grid.getxmax()) - textWidth, this.grid.Y(this.msgy));

                    }

                }
            }

            addEvent(date, label) {
                this.events.push({ date, label });
            }
            setMessage(txt, y) {
                this.msg = txt;
                this.msgy = y;
            }
        }

        return resolve(VerticalTimeline)

    })

}
