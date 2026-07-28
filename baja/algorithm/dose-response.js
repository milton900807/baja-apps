let DoseResponse = class DoseResponse {

    static calculateIC50(doses, responses) {
        if (doses.length !== responses.length) {
            throw new Error("Doses and responses arrays must have the same length.");
        }
        function logisticModel(params, dose) {
            const [Bottom, Top, IC50, HillSlope] = params;
            return Bottom + (Top - Bottom) / (1 + Math.pow(dose / IC50, HillSlope));
        }
        function calculateSSE(params) {
            return doses.reduce((sse, dose, i) => {
                const predicted = logisticModel(params, dose);
                const error = responses[i] - predicted;
                return sse + error * error;
            }, 0);
        }
        const initialParams = [
            Math.min(...responses),
            Math.max(...responses),
            doses[Math.floor(doses.length / 2)],
            1.0
        ];
        function optimizeParams(params, learningRate = 0.01, iterations = 1000) {
            let bestParams = params;
            let bestSSE = calculateSSE(params);

            for (let iter = 0; iter < iterations; iter++) {
                const gradients = Array(params.length).fill(0);

                params.forEach((param, index) => {
                    const delta = 0.0001;
                    const testParamsUp = [...params];
                    const testParamsDown = [...params];

                    testParamsUp[index] += delta;
                    testParamsDown[index] -= delta;

                    gradients[index] = (calculateSSE(testParamsUp) - calculateSSE(testParamsDown)) / (2 * delta);
                });

                const newParams = params.map((param, index) => param - learningRate * gradients[index]);
                const newSSE = calculateSSE(newParams);

                if (newSSE < bestSSE) {
                    bestParams = newParams;
                    bestSSE = newSSE;
                }
            }

            return bestParams;
        }

        const optimizedParams = optimizeParams(initialParams);

        const IC50 = optimizedParams[2];

        return IC50;
    }
}

return DoseResponse;
