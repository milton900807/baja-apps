function () {

  let generateScatterData = (samples, values, stdDev) => {
    let xAxisLabels = [];
    let yAxisLabels = [];
    let scatterPlotData = { points: [] };
    let xLabelRow = -1;
    let yLabelCol = -1;
    for (let index = 0; index < samples.length; index++) {
      yAxisLabels.push(samples[index]);
      xAxisLabels.push(values[index]);
      let scatterPoint = {
        x: index,
        y: values[index],
        name: samples[index],
        color: 'blue',
        stdDev: stdDev[index],
        isSelected: false
      };
      scatterPlotData.points.push(scatterPoint);
    }
    return scatterPlotData;
  }

  return {
    'aggregate': (samples, values, pt) => {
      let sampleSums = {};
      let sampleCounts = {};
      let sampleValues = {};

      for (let i = 0; i < samples.length; i++) {
        let sample = samples[i];
        let value = values[i];

        if (!sampleSums[sample]) {
          sampleSums[sample] = 0;
          sampleCounts[sample] = 0;
          sampleValues[sample] = [];
        }

        sampleSums[sample] += value;
        sampleCounts[sample] += 1;
        sampleValues[sample].push(value);
      }

      let distinctSamples = [];
      let averageValues = [];
      let stdDeviations = [];

      for (let sample in sampleSums) {
        let sum = sampleSums[sample];
        let count = sampleCounts[sample];
        let avg = sum / count;

        let variance = sampleValues[sample].reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / count;
        let stdDev = Math.sqrt(variance);

        distinctSamples.push(sample);
        averageValues.push(avg);
        stdDeviations.push(stdDev);
      }

      return {
        distinctSamples,
        averageValues,
        stdDeviations
      };
    }
    ,
    'log': (dataset, pt) => {
      let rs = [];
      console.log('debubg');
      if (typeof dataset === 'number') {

        rs.push(Math.log10(dataset));
      } else if (Array.isArray(dataset)) {

        for (let r of dataset) {
          if (typeof r === 'number') {
            rs.push(Math.log10(r));
          }
          else if (r.uid){
            r.value = Math.log10(r.value)
            rs.push(r);
          }
          else {
            rs.push('NaN');
          }
        }
      } else {
        throw new TypeError("Invalid dataset: must be a number or an array of numbers.");
      }

      return rs;
    },
    'plotbar': async (dataset, pt) => {
      let MPlot = await exec("flexigraph/plot.js");
      function sortScatterDataByY(scatterPlotData) {
        return scatterPlotData.sort((a, b) => a.y - b.y);
      }
      let sca = generateScatterData(dataset['distinctSamples'], dataset['averageValues'], dataset['stdDeviations']);
      sca.points = sortScatterDataByY(sca.points)
      const combinedPlot = new MPlot(sca);
      combinedPlot.x_axis_label = '';
      combinedPlot.y_axis_label = '';
      combinedPlot.errorBarColor = 'gray';
      combinedPlot.fitScaleToData = false;
      combinedPlot.showAxis = true;
      combinedPlot.type = 'barchart'
      const maxY = Math.max(...sca.points.map(p => p.y));
      combinedPlot.setymax(maxY);
      combinedPlot.w = pt.grid.worldWidth(500);
      combinedPlot.h = pt.grid.worldHeight(500);
      combinedPlot.x = pt.grid.Xwc(200)
      combinedPlot.y = pt.grid.Ywc(200)
      combinedPlot.setxmin(0);

      combinedPlot.grid.rescale();
      pt.resetState();
      pt.setPlot(combinedPlot);

    },
    'var': async (dataset, pt) => {
      return dataset;
    },
  }
}
