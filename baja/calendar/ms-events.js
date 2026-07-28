function (selectedTimeLinePlot, file) {

    return new Promise(async (resolve, reject) => {
        const startDate = selectedTimeLinePlot.startDate;
        const endDate = selectedTimeLinePlot.endDate;
        const grid = selectedTimeLinePlot.grid;
        console.log('debubg');
        function getIconBase64(name) {
            const icons = {
                swimming: 'data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDA2NkZGIiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnL3N2ZyI+PHBhdGggZD0iTTEyIDQuNUMxMiA1LjMzIDExLjMzIDYgMTAuNSA2UzkgNS4zMyA5IDQuNSA5IDMuNjcgOSAyLjg1IDkuNTI1IDIuMjUgMTAuNSAyeiBNMiAxNWMuODMgMCAxLjY2LjMzIDIuMzUuOTkgMS4yMSAxLjIyIDIuNDkgMS4yMiAzLjY5IDAgLjY5LS42NiAxLjUyLS45OSAyLjM1LS45OS44MyAwIDEuNjYuMzMgMi4zNS45OSAxLjIxIDEuMjIgMi40OSAxLjIyIDMuNjkgMCAuNjktLjY2IDEuNTItLjk5IDIuMzUtLjk5LjgzIDAgMS42Ni4zMyAyLjM1Ljk5IDEuMjEgMS4yMiAyLjQ5IDEuMjIgMy42OSAwIC42OS0uNjYgMS41Mi0uOTkgMi4zNS0uOTl2Mi4wN0M4LjU1IDIxLjgxIDUuNDQgMjIgMiAyMnYtM2MwLS44My4zMy0xLjY2Ljk5LTIuMzUgMS4yMS0xLjIyIDIuNDktMS4yMiAzLjY5IDB6Ii8+PC9zdmc+',
                surfing: 'data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDBBOEZGIiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnL3N2ZyI+PHBhdGggZD0iTTE0IDQuNUMxNCA1LjMzIDEzLjMzIDYgMTIuNSA2UzExIDUuMzMgMTEgNC41IDExIDMuNjcgMTEgMi44NSA4LjUgMi4yNSA5IDIgOSAxMiA2LjUgMTIgOS4zNCAxMiAxMCAxMiAxMC41IDEyIDExdi40OWwtMS4zNSAxLjM1QTEgMSAwIDAgMCAxMSAxN2MxLjM4IDAgMi40OSAxLjEyIDIuNDkgMi41cy0xLjExIDIuNS0yLjQ5IDIuNUEzLjc1IDMuNzUgMCAwIDAgOCAyMWMwLTEuMjEuOTktMi4xOSAyLjIxLTIuNTEuNzQtLjE3IDEuNTQtLjI1IDIuMy0uMjVsMS4xOS0xLjE4Yy4zNS0uMzUuNS0uODEuNS0xLjI5IDAtLjQ3LS4xNi0uOTQtLjUtMS4yOUwxMyAxMi4wMUwxNSAxMEgyMXYtMmgtNS41eiIvPjwvc3ZnPg==',
                dog: 'data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjNjY0MjIxIiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnL3N2ZyI+PHBhdGggZD0iTTggMTBhMiAyIDAgMCAxIDItMmgyYzAgLjQ3LjE2Ljk0LjUgMS4yOWwuNSA1LjM2QTQuNSA0LjUgMCAwIDAgNiAxOGMwLTEuMzMuMzItMi42Mi45Mi0zLjc0TDggMTB6bTctOGMwLS43Ni0uNzEtMS41LTEuNS0xLjUtLjY3IDAtMS4xMy40NC0xLjQ3LjkyQzExLjAzMiAzLjgzMyAxMiA1Ljg1IDEyIDZ2MmgyYzEtLjI2IDEuMzktLjY0IDEuNjMtMS4wNGwtLjYzLTEuNEMxNC4wMjQgNi4xNTUgMTUgNS4xOTIgMTUgNC4wMXoiLz48L3N2Zz4=',
                cat: 'data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjNDQ0NDQ0IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnL3N2ZyI+PHBhdGggZD0iTTIwIDEyYzAtMS42OC0xLjQ4LTMuMi0zLjIxLTMuMDlBNS45OSA1Ljk5IDAgMCAwIDEyIDUuNzVWM0g5djIuNzVDOC4wMyA1Ljg1IDYuMjcgNy44MiA2LjIxIDExLjAyQzQuNDggMTEuMiAzIDEyLjcyIDMgMTRjMCAxLjEgMS4yNyAyLjEzIDIuNTYgMi4xM2MuNTcgMCAxLjQ0LS4yNSAyLjEyLS43Mi4xNy0uMTIuNC0uMTIuNTcgMCAuNjguNDcgMS41NS43MiAyLjEyLjcyIDEuMyAwIDIuNTYtMS4wMyAyLjU2LTIuMTMgMC0xLjI4LTEuNDgtMi44LTMuMjEtMi45eiIvPjwvc3ZnPg==',
                waterpolo: 'data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDA2NkZGIiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnL3N2ZyI+PHBhdGggZD0iTTEyIDIyYy0xLjc1IDAtMy4zNy0uNzYtNC41LTIuMDAxQzYuODcgMjAuMDY4IDUuMjUgMjAuODMgMy41IDIyYTIuNzUgMi43NSAwIDAgMS0zLjUtMi43NUMwIDE5Ljk2IDIuOTUgMTggNiAxOGMxLjA3IDAgMi4xLjMgMyAuODQzQzEwLjMzIDE3LjI4IDEwLjY3IDE3IDEwLjY3IDE3YzEuNjUgMCAzLjIzLjg0IDQuMTEgMi4xNS45Ni0xLjU3IDIuNDYtMi41IDIuODktMi41LjU1IDAgMSAuNDUgMSAxdjEuMTZjMCAxLjQ2LS44NSAyLjg1LTIuMTkgMy43NUE2Ljg5IDYuODkgMCAwIDEgMTIgMjJ6Ii8+PC9zdmc+',
                soccer: 'data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDAwMDAwIiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnL3N2ZyI+PHBhdGggZD0iTTEyIDJDNi40NyAyIDIgNi40NyAyIDEyczQuNDcgMTAgMTAgMTAgMTAtNC40NyAxMC0xMFMxNy41MyAyIDEyIDJ6bTAgMThjLTMuNTUgMC02LjUyLTIuNTUtNy40My01LjkxbDQuNzMtMi4wOCAzLjcxIDMuNzEtLjkxIDQuNzNjLS4yOS4wNC0uNTguMDUtLjktLjA1eiIvPjxwYXRoIGQ9Ik0xMiAxMmwtMy0yLjUtMS00LjUgMy0yLjUgMyAyLjUgMSA0LjUtMSAxLjVoLS4wMXoiLz48L3N2Zz4=',
                golf: 'data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMzMzMzMzIiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnL3N2ZyI+PHBhdGggZD0iTTEyIDE4YzMuMzEgMCA2IC44OSA2IDJzLTIuNjkgMi02IDItNi0uODktNi0yIDIuNjktMiA2LTJ6bS0zLTdWMi41bDcgMy41LTcgMy41VjExaDJ2LTlsLTktNC41VjEyaDJ6Ii8+PC9zdmc+',
                exclamation: 'data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjRkY4MDAwIiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnL3N2ZyI+PHBhdGggZD0iTTEyIDJhMTAgMTAgMCAxIDAgMCAyMCAxMCAxMCAwIDAgMCAwLTIwem0wIDE4YTEgMSAwIDEgMSAwLTJ2MmExIDEgMCAwIDEgMCAyek0xMiA2Yy41NSAwIDEgLjQ1IDEgMXY4YTEgMSAwIDAgMS0yIDBWN2MwLS41NS40NS0xIDEtMXoiLz48L3N2Zz4=',
                meeting: `data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMzNBQkY1IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnL3N2ZyI+PHBhdGggZD0iTTkgMTBjMS4xIDAgMi0uOSAyaS0yYy0xLjEgMC0yIC45LTIgMnYxaDJ2LTFjMC0uNTUuNDUtMSAxLTF6bTcuNS0yYTQuNSA0LjUgMCAxIDAgMCA5IDQuNSA0LjUgMCAwIDAgMC05ek0xOSA0aC0xVjJIMTlWNEg1VjJINXYySDRjLTEuMSAwLTItLjktMi0ydjE2YzAgMS4xLjkgMiAyIDJoMTRjMS4xIDAgMi0uOSAyLTJWNmMwLTEuMS0uOS0yLTItMnpNNyA2aDEwYy4xMSAwIC4yLjEgLjIuMnYxLjhIMTZWOGMwLS4xLjA5LS4yLjItLjJIN1Y2eiIvPjwvc3ZnPg==`,
                airplane: 'data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDA4Q0ZGIiB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnL3N2ZyI+PHBhdGggZD0iTTIgMTUuMTRsNy44Ny0yLjU0IDMuNzMgMy43M1YyMmgybC41LTEuNzFMMTQgMTRsNi42Mi0yLjE0YTEgMSAwIDAgMCAuMTItMS44MUw5Ljg4IDZsLjY3LTQuMDRBMSAxIDAgMCAwIDkuMjIgMEg4TDUuMjIgNy41MiAzIDguNXYxLjE4bDEuNjggMS42OEwyIDE1LjE0eiIvPjwvc3ZnPg=='

            };

            return icons[name.toLowerCase()] || null;
        }

        try {

            function getXFromDate(date, xMin, xMax, start, end) {

                const localDate = new Date(date);
                const localStart = new Date(start);
                const localEnd = new Date(end);

                const totalCanvasRange = xMax - xMin;
                const totalTimeRange = localEnd.getTime() - localStart.getTime();
                const timeSinceStart = localDate.getTime() - localStart.getTime();
                const normalizedTime = timeSinceStart / totalTimeRange;

                return xMin + normalizedTime * totalCanvasRange;
            }

            function convertEventsToPoints(events, xMin, xMax, timeStart, timeEnd) {
                const organizerColors = {};
                const colorPalette = [
                    'red', 'blue', 'green', 'orange', 'purple', 'teal', 'brown', 'magenta', 'cyan', 'lime'
                ];
                let colorIndex = 0;

                events.forEach(event => {
                    if (!organizerColors[event.organizer]) {
                        organizerColors[event.organizer] = colorPalette[colorIndex % colorPalette.length];
                        colorIndex++;
                    }
                });

                const points = events
                    .filter(event => {
                        const eventEnd = new Date(event.end);
                        return eventEnd <= timeEnd;
                    })
                    .map(event => {
                        const startDate = (event.start);
                        const endDate = (event.end);
                        const durationMs = endDate - startDate;
                        console.log('debubg');
                        let __subject = [event.subject, event.location, event.body]
                            .filter(Boolean)
                            .join('\n');
                        const subject = __subject.toLowerCase();
                        console.log('debubg');

                        let __icon = null;
                        if (subject.includes('united') || subject.includes('aero') || subject.includes('flight')) {
                            __icon = getIconBase64('airplane');
                        } else if (subject.includes('<>') || subject.includes('meeting') || subject.includes('teams') || subject.includes('zoom')) {
                            __icon = getIconBase64('meeting');
                            __subject = subject;
                        }

                        const pacificOffsetMs = new Date().getTimezoneOffset() * 60 * 1000;
                        const localStartDate = new Date(startDate.getTime() - pacificOffsetMs);
                        const localEndDate = new Date(endDate.getTime() - pacificOffsetMs);
                        const localTimeStart = new Date(timeStart.getTime() - pacificOffsetMs);
                        const localTimeEnd = new Date(timeEnd.getTime() - pacificOffsetMs);

                        const startX = getXFromDate(localStartDate, xMin, xMax, timeStart, timeEnd);
                        const endX = getXFromDate(localEndDate, xMin, xMax, timeStart, timeEnd);

                        return {
                            x: endX,
                            y: Math.random(),
                            type: (durationMs < 1000 || !startX || startX < 0) ? 'milestone' : 'interval',
                            startX: startX,
                            name: __subject,
                            color: organizerColors[event.organizer],
                            icon: __icon
                        };
                    });

                return points;
            }

            const formatEvents = (events) => {
                return events.map(event => ({
                    subject: event.subject,
                    start: event.start?.dateTime ? new Date(event.start.dateTime) : null,
                    end: event.end?.dateTime ? new Date(event.end.dateTime) : null,
                    location: event.location?.displayName || "",
                    organizer: event.organizer?.emailAddress?.name || ""
                }));
            };

            let result = await readUserTempFile(file)
            resolve(convertEventsToPoints(formatEvents(result), grid.xmin, grid.xmax, startDate, endDate));

        }
        catch (error2) {
            console.error("Error fetching calendar events:", error2);
        }
    })
}
