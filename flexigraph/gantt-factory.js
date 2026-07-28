function (model) {

    return new Promise(async (resolve___, reject) => {
        let MPlot = await exec('flexigraph/plot.js')
        const plot = new MPlot({ points: model.intervals });
        plot.startDate = new Date(model.window.start);
        plot.endDate = new Date(model.window.end);
        const xMin = Math.min(...model.intervals.map(p => p.startX));
        const xMax = Math.max(...model.intervals.map(p => p.x));
        plot.grid.zoom(xMin, xMax, 0, 1);
        plot.w = 1000;
        plot.h = 300;
        plot.type = 'timeline'
        plot.name = 'timeline';
        plot.x_axis_label = "Time (Years)";
        plot.y_axis_label = "Sample Metric";
        plot.fitScaleToData = false;
        plot.grid.rescale();
        return resolve___(plot);
    })

}
