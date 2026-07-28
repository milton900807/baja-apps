function (grid, startDate, endDate) {

    return new Promise(async (resolve, reject) => {

        const flyingIconBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAYAAAA7MK6iAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAYdEVYdFNvZnR3YXJlAHBhaW50Lm5ldCA0LjEuNv1OCegAAAJ8SURBVEhL7ZY/aBNxFMfvNLEJWLUGSUIKpdY/2LooFDUSiJnEpo0odDGgXVwSi4Ogg4UOHWoHo5EWQYlVx4qDSytYxbWIKE6BDlpx0KEqxarV3PP7vbscSbmWNOnpYL/wgZffe+/7JT+SS5QqdQq8N2H9V3R86yaP9jIbF8KaZ0bLWb14duWYyKCi83yoQ3hmtJyTCn7N3u2wglnj7KfZc0zrgHy9d9QKZo2zgtlzTGvBa8GO6f8L3gXsgvnYZM8RdXlcypdb56OiZbZYwax5xh5njNHV0Xow0FBfp+UzYStwMexhhlc+AGq+dh+YaG1plLmRNtvAUjjDWe6Yu1Vpv9elvL3UvU9+Z4O2QXZwljvcpYdhVbl6vG7l+9P+Q7bmlTDZHxZ4zNPLsFxedeBmwFcvH260lxkVrm+TqUxckrEd8mN4p3XOmmfscaZ0hx70oqfpbavGjRuUqWS0SeZyEWv528geGb1wpGiQB0t9nfKc4Sx3in160ZPezABl4o/49LWzB/Thwv2IvBnulHRXG69rAb0xEAP8hNsF89PMHmfGuHMusVf3oBfn6I3eNCj7w+AH8vrxHe1RX0yaQz4OzYA+EARFVfrk4g53Z+hFz1cTOd4KZ5llaTcQVVVpMA4SwAUWa6WPTHrQa9z05iyzLPHtnwAt+qultdLgUtGbGVWpluCa9E+C2xu8ymR4u0fmc4etYNY8Y48zxujqKAQeut1u7cFFI3Bh9KC8u92pw5pn7HGGs6CJi7XqaiAQkHQ6rfWeTsiZaEg2e1Ve7yfwkXUyEpRUMi6pVErz+/3sZblYqy6DWcCrHALdoBkUxXd3EgyCJ+Az4M4yUpQ/695U2dxJnikAAAAASUVORK5CYII=';
        const meetingIconBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAYAAAA7MK6iAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAYdEVYdFNvZnR3YXJlAHBhaW50Lm5ldCA0LjEuNv1OCegAAAJ8SURBVEhL7ZY/aBNxFMfvNLEJWLUGSUIKpdY/2LooFDUSiJnEpo0odDGgXVwSi4Ogg4UOHWoHo5EWQYlVx4qDSytYxbWIKE6BDlpx0KEqxarV3PP7vbscSbmWNOnpYL/wgZffe+/7JT+SS5QqdQq8N2H9V3R86yaP9jIbF8KaZ0bLWb14duWYyKCi83yoQ3hmtJyTCn7N3u2wglnj7KfZc0zrgHy9d9QKZo2zgtlzTGvBa8GO6f8L3gXsgvnYZM8RdXlcypdb56OiZbZYwax5xh5njNHV0Xow0FBfp+UzYStwMexhhlc+AGq+dh+YaG1plLmRNtvAUjjDWe6Yu1Vpv9elvL3UvU9+Z4O2QXZwljvcpYdhVbl6vG7l+9P+Q7bmlTDZHxZ4zNPLsFxedeBmwFcvH260lxkVrm+TqUxckrEd8mN4p3XOmmfscaZ0hx70oqfpbavGjRuUqWS0SeZyEWv528geGb1wpGiQB0t9nfKc4Sx3in160ZPezABl4o/49LWzB/Thwv2IvBnulHRXG69rAb0xEAP8hNsF89PMHmfGuHMusVf3oBfn6I3eNCj7w+AH8vrxHe1RX0yaQz4OzYA+EARFVfrk4g53Z+hFz1cTOd4KZ5llaTcQVVVpMA4SwAUWa6WPTHrQa9z05iyzLPHtnwAt+qultdLgUtGbGVWpluCa9E+C2xu8ymR4u0fmc4etYNY8Y48zxujqKAQeut1u7cFFI3Bh9KC8u92pw5pn7HGGs6CJi7XqaiAQkHQ6rfWeTsiZaEg2e1Ve7yfwkXUyEpRUMi6pVErz+/3sZblYqy6DWcCrHALdoBkUxXd3EgyCJ+Az4M4yUpQ/695U2dxJnikAAAAASUVORK5CYII=';

        if (typeof startDate === 'string')
            startDate = new Date(startDate)
        if (typeof endDate === 'string')
            endDate = new Date(endDate)

        exec('lib/msgraph.js').then(async (MSGraph) => {

            try {

                function getXFromDate(date, xMin, xMax, start, end) {

                    const totalCanvasRange = xMax - xMin;
                    const totalTimeRange = end.getTime() - start.getTime();
                    const timeSinceStart = new Date(date).getTime() - new Date(start).getTime();
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
                    const points = events.map(event => {
                        const startDate = new Date(event.start);
                        const endDate = new Date(event.end);
                        const durationMs = endDate - startDate;
                        let subject = event.subject + ' \n' + event.location + '\n' + event.body;
                        let icon = null;
                        if (subject.includes('united') || subject.includes('aero') || subject.includes('plane')) {
                            icon = flyingIconBase64;
                        } else if (subject.includes('<>')) {
                            icon = meetingIconBase64;
                        }

                        const startX = getXFromDate(startDate, xMin, xMax, timeStart, timeEnd);
                        const endX = getXFromDate(endDate, xMin, xMax, timeStart, timeEnd);

                        return {
                            x: endX,
                            y: Math.random(),
                            type: (durationMs < 8.64e+7 || !startX || startX < 0) ? 'milestone' : 'interval',
                            startX: startX,
                            name: subject,
                            color: organizerColors[event.organizer],
                            icon: icon
                        };
                    });

                    return points;
                }

                const formatEvents = (events) => {
                    return events.map(event => ({
                        subject: event.subject,
                        start: event.start?.dateTime,
                        end: event.end?.dateTime,
                        location: event.location?.displayName || "",
                        organizer: event.organizer?.emailAddress?.name || ""
                    }))
                }
                let sharepointConfig = { 'scope': ['Calendars.Read'] };
                MSGraph.getClient(sharepointConfig).then(async (client) => {
                    try {
                        const result = await client
                            .api('/me/calendarview')
                            .header('Prefer', 'outlook.timezone="UTC"')
                            .query({
                                startDateTime: startDate.toISOString(),
                                endDateTime: endDate.toISOString()
                            })
                            .select('subject,start,end,location,organizer,attendees,body,bodyPreview,categories,createdDateTime,lastModifiedDateTime')
                            .orderby('start/dateTime')
                            .top(50)
                            .get();

                        resolve(convertEventsToPoints(formatEvents(result.value), grid.xmin, grid.xmax, startDate, endDate));

                    } catch (error) {

                        console.error("Error fetching calendar events:", error);
                        return [];
                    }
                })
            }
            catch (error2) {

                console.error("Error fetching calendar events:", error2);

            }
        })

    })

}
