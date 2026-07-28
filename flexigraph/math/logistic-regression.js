function (__concentrations, __percent_control) {
    return new Promise((resolve, reject) => {
        function calculateIC50(concentrations, percentControl) {
            const regression = performLogisticRegression(concentrations, percentControl);
            const IC50 = findIC50(regression);
            return IC50;
        }

        function performLogisticRegression(x, y) {
            const n = x.length;

            let minY = Math.min(...y);
            let maxY = Math.max(...y);
            let slope = 1;
            let logIC50 = (Math.log10(Math.min(...x)) + Math.log10(Math.max(...x))) / 2;

            function objective(params) {
                let [min, max, slope, logIC50] = params;
                let sumOfSquares = 0;
                for (let i = 0; i < n; i++) {
                    let yFit = min + (max - min) / (1 + Math.pow(10, slope * (Math.log10(x[i]) - logIC50)));
                    sumOfSquares += Math.pow(y[i] - yFit, 2);
                }
                return sumOfSquares;
            }

            let params = [minY, maxY, slope, logIC50];
            let stepSize = 0.01;
            for (let i = 0; i < 10000; i++) {
                let gradient = [0, 0, 0, 0];
                let delta = 1e-5;
                for (let j = 0; j < 4; j++) {
                    let paramsCopy = [...params];
                    paramsCopy[j] += delta;
                    gradient[j] = (objective(paramsCopy) - objective(params)) / delta;
                    params[j] -= stepSize * gradient[j];
                }
            }

            return params;
        }

        function findIC50(params) {
            let [min, max, slope, logIC50] = params;
            return Math.pow(10, logIC50);
        }

        const IC50 = calculateIC50(__concentrations, __percent_control);
        console.log(`Estimated IC50: ${IC50}`);
        resolve ( {
            'IC50': IC50
        })
    });

}
