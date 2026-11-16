function (platetrack, start_date, end_date, title) {

    return new Promise(async (resolve, reject) => {

        let _name = null;
        let type_path = '';

        const Plot = await exec('flexigraph/plot');

        // A NAME THAT WAS ALREADY GIVEN IS NOT ASKED FOR AGAIN. "A timeline called mywork"
        // says the name in the request, and a box asking for it immediately afterwards reads
        // as not having been listened to. The prompt is for the callers that have no name to
        // pass -- the Draw > Timeline menu item -- and they pass nothing, so it still opens.
        let m = ('' + (title == null ? '' : title)).trim();
        if (!m) {
            let va = await prompt("Timeline title", ["Name"], { "Name": '' }, 300, 300)
            m = va ? ('' + (va['Name'] || '')).trim() : '';
        }
        if (!m || m.length <= 0) {
            m = generateNautName();
        }
        const load_file = async (path, name) => {
            let jsonobj = {
                'spath': path,
                'rule_name': name,
                'user': getUser(),
                'type': 'ljp'
            };
            let host_ = window['env']['apiUrl'];
            let rs = await POSTJSON(jsonobj, host_ + '/get-script');
            return rs;
        };
        if (_name && type_path) {
            if (type_path === _name) {
                type_path = ''
            }
            const lf = await load_file(type_path, _name)
            if (lf && lf.rule_value) {
                const ts = __decompress(lf.rule_value);
                const pl = Plot.fromJSON(ts)
                pl.uid = uuid();

                hideAllModal();
                let plot = pl;
                const spanMs = end_date - start_date;
                const spanHours = spanMs / (1000 * 60 * 60);
                const numberOfPoints = 2;
                const dataPoints = [];
                const scatterData = { points: dataPoints };

                const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
                const formattedDate = start_date.toLocaleDateString('en-US', options);
                const formattedDate2 = end_date.toLocaleDateString('en-US', options);

                let i = 0;
                let fraction = i / (numberOfPoints - 1);
                let pointTime = new Date(start_date.getTime() + fraction * spanMs);
                let xHours = (pointTime - start_date) / (1000 * 60 * 60);
                let y = 0.1;

                const options2 = { month: 'long', day: 'numeric', year: 'numeric' };
                const formattedDate3 = start_date.toLocaleDateString('en-US', options2);
                dataPoints.push({ x: xHours, y, name: formattedDate3 });
                i = 1;

                fraction = i / (numberOfPoints - 1);
                pointTime = new Date(start_date.getTime() + fraction * spanMs);
                xHours = (pointTime - start_date) / (1000 * 60 * 60);
                y = 0.1;
                const options4 = { month: 'long', day: 'numeric', year: 'numeric' };
                const formattedDate4 = end_date.toLocaleDateString('en-US', options4);
                dataPoints.push({ x: xHours, y, name: formattedDate4 });
                plot.startDate = (start_date);
                plot.endDate = (end_date);
                plot.type = 'timeline'
                const xMin = Math.min(...scatterData.points.map(p => p.x));
                const xMax = Math.max(...scatterData.points.map(p => p.x));
                plot.grid.zoom(xMin, xMax, 0, 1);

                plot.name = formattedDate + ' - ' + formattedDate2;
                plot.x_axis_label = "Time (Years)";
                plot.y_axis_label = "Sample Metric";
                plot.fitScaleToData = false;
                plot.grid.rescale();
                pl.setWidth(platetrack.grid.worldWidth(800))
                pl.setHeight(platetrack.grid.worldHeight(400))
                pl.name = m;

                await platetrack.panToNextSpot(pl.getWidth() + platetrack.grid.worldWidth(200));
                setTimeout(() => {
                    platetrack.setPlotCenter(pl)
                }, 100)
            }
        } else {

            const spanMs = end_date - start_date;
            const spanHours = spanMs / (1000 * 60 * 60);
            const numberOfPoints = 2;
            const dataPoints = [];
            const scatterData = { points: dataPoints };

            const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
            const formattedDate = start_date.toLocaleDateString('en-US', options);
            const formattedDate2 = end_date.toLocaleDateString('en-US', options);

            let i = 0;
            let fraction = i / (numberOfPoints - 1);
            let pointTime = new Date(start_date.getTime() + fraction * spanMs);
            let xHours = (pointTime - start_date) / (1000 * 60 * 60);
            let y = 0.1;

            const options2 = { month: 'long', day: 'numeric', year: 'numeric' };
            const formattedDate3 = start_date.toLocaleDateString('en-US', options2);
            dataPoints.push({ x: xHours, y, name: formattedDate3 });
            i = 1;

            fraction = i / (numberOfPoints - 1);
            pointTime = new Date(start_date.getTime() + fraction * spanMs);
            xHours = (pointTime - start_date) / (1000 * 60 * 60);
            y = 0.1;
            const options4 = { month: 'long', day: 'numeric', year: 'numeric' };
            const formattedDate4 = end_date.toLocaleDateString('en-US', options4);
            dataPoints.push({ x: xHours, y, name: formattedDate4 });

            const MPlot = await exec('flexigraph/plot')
            const plot = new MPlot(scatterData);
            plot.startDate = (start_date);
            plot.endDate = (end_date);
            plot.type = 'timeline'

            plot.startDate = (start_date);
            plot.endDate = (end_date);
            plot.type = 'timeline'
            const xMin = Math.min(...scatterData.points.map(p => p.x));
            const xMax = Math.max(...scatterData.points.map(p => p.x));
            plot.grid.zoom(xMin, xMax, 0, 1);

            plot.name = formattedDate + ' - ' + formattedDate2;
            plot.x_axis_label = "Time (Years)";
            plot.y_axis_label = "Sample Metric";
            plot.fitScaleToData = false;
            plot.grid.rescale();

            plot.setWidth(platetrack.grid.worldWidth(800))
            plot.setHeight(platetrack.grid.worldHeight(400))
            plot.name = m;
            setTimeout(async () => {
                await platetrack.panToNextSpot(platetrack.grid.worldWidth(plot.grid.width));
                await platetrack.setPlotCenter(plot)
                setTimeout(async () => {
                    if (plot)
                        await platetrack.zoomintoplot(plot)
                }, 299)
            }, 1000)
        }
        resolve();
    })
}
