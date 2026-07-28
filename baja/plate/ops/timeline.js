function (pt, selectedPlate) {

    function parseDurationToMilliseconds(durationStr) {
        const regexes = [
            { regex: /(\d+)[–-](\d+)\s*minutes?/i, multiplier: 60 * 1000 },
            { regex: /(\d+)[–-](\d+)\s*hours?/i, multiplier: 60 * 60 * 1000 },
            { regex: /(\d+)[–-](\d+)\s*days?/i, multiplier: 24 * 60 * 60 * 1000 },
            { regex: /(\d+)[–-](\d+)\s*weeks?/i, multiplier: 7 * 24 * 60 * 60 * 1000 },
            { regex: /(\d+)[–-](\d+)\s*months?/i, multiplier: 'months' },
            { regex: /(\d+)[–-](\d+)\s*quarters?/i, multiplier: 'quarters' },
            { regex: /(\d+)[–-](\d+)\s*years?/i, multiplier: 'years' },
            { regex: /(\d+)\s*minutes?/i, multiplier: 60 * 1000 },
            { regex: /(\d+)\s*hours?/i, multiplier: 60 * 60 * 1000 },
            { regex: /(\d+)\s*days?/i, multiplier: 24 * 60 * 60 * 1000 },
            { regex: /(\d+)\s*weeks?/i, multiplier: 7 * 24 * 60 * 60 * 1000 },
            { regex: /(\d+)\s*months?/i, multiplier: 'months' },
            { regex: /(\d+)\s*quarters?/i, multiplier: 'quarters' },
            { regex: /(\d+)\s*years?/i, multiplier: 'years' },
        ];

        for (const { regex, multiplier } of regexes) {
            const match = durationStr.match(regex);
            if (match) {
                const value = parseInt(match[2] || match[1]);
                return { amount: value, unit: multiplier };
            }
        }
        return { amount: 0, unit: 'ms' };
    }

    function addDuration(date, duration) {
        const result = new Date(date);
        const { amount, unit } = duration;

        switch (unit) {
            case 'months':
                result.setMonth(result.getMonth() + amount);
                break;
            case 'quarters':
                result.setMonth(result.getMonth() + 3 * amount);
                break;
            case 'years':
                result.setFullYear(result.getFullYear() + amount);
                break;
            default:
                result.setTime(result.getTime() + amount);
                break;
        }

        return result;
    }

    function generateTimeline(startDateStr, tasks) {
        let currentDate = new Date(startDateStr);
        const timeline = [];

        for (const [comment, durationStr] of tasks) {
            const duration = parseDurationToMilliseconds(durationStr);
            const start = new Date(currentDate);
            const end = addDuration(start, duration);

            timeline.push({
                comment,
                start: start.toISOString(),
                end: end.toISOString()
            });

            currentDate = new Date(end);
        }

        return timeline;
    }

    return new Promise(async (resolve, reject) => {
        let Plate = await exec('baja/plate/plate')
        let GenericWell = await exec('baja/plate/well')
        let ls = []
        ls[`Add selected to timeline`] = async () => {
            let rows = selectedPlate.getSelectedRow();

            let startTime = new Date();

            let tasks = []
            for (let r of rows) {
                let comment = r[0].value;
                let timeincr = r[1].value;
                tasks.push([comment, timeincr])

            }
            const timeline = generateTimeline(startTime, tasks)
            showModal({
                wid: 'json',
                data: JSON.stringify(timeline)
            })

        }
        return resolve(ls)

    })

}
