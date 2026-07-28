return new Promise(async (resolve, reject) => {
    const { createMatrix, extractColumn, extractRow } = await exec('bio/align/matrix.utils.js');
    const { directions } = await exec('bio/align/dtypes.js');

    function computeGapLength(sequence) {
        let max = -1;
        let gapLength = 0;
        for (let cursor = 1; cursor < sequence.length; cursor += 1) {
            if (sequence[cursor] > max) {
                max = sequence[cursor];
                gapLength = cursor;
            }
        }
        return { max, gapLength };
    }

    const scoreReducer = (max, score) => (score.value > max.value ? score : max);

    function computeScores({ scoringMatrix, row, col, gapScoreFunction, similarityScore }) {

        const leftSequence = extractRow({ matrix: scoringMatrix, row, col });
        const topSequence = extractColumn({ matrix: scoringMatrix, row, col });

        const { max: leftMax, gapLength: leftGapLength } = computeGapLength(leftSequence.reverse());
        const { max: topMax, gapLength: topGapLength } = computeGapLength(topSequence.reverse());

        return [
            { value: topMax + gapScoreFunction(topGapLength), direction: directions.UP },
            { value: leftMax + gapScoreFunction(leftGapLength), direction: directions.LEFT },
            {
                value: scoringMatrix[row - 1][col - 1] + similarityScore,
                direction: directions.DIAGONAL,
            },
        ];
    }

    function smithWaterman({ sequence1, sequence2, gapScoreFunction, similarityScoreFunction }) {

        const heigth = sequence1.length + 1;
        const width = sequence2.length + 1;
        const scoringMatrix = createMatrix({ width, heigth });
        const tracebackMatrix = createMatrix({ width, heigth });

        let highestScore = 0;
        let highestScoreCoordinates = [0, 0];

        for (let row = 1; row < heigth; row += 1) {
            for (let col = 1; col < width; col += 1) {

                const similarityScore = similarityScoreFunction(sequence1[row - 1], sequence2[col - 1]);

                const scores = computeScores({
                    scoringMatrix,
                    row,
                    col,
                    gapScoreFunction,
                    similarityScore,
                });

                const { value: bestScore, direction } = scores.reduce(scoreReducer, {
                    value: 0,
                    direction: directions.NONE,
                });
                scoringMatrix[row][col] = bestScore;
                tracebackMatrix[row][col] = direction;

                if (bestScore >= highestScore) {
                    highestScore = bestScore;
                    highestScoreCoordinates = [row, col];
                }
            }
        }

        return {
            alignmentScore: highestScore,
            startCoordinates: highestScoreCoordinates,
            scoringMatrix,
            tracebackMatrix,
        };
    }
    resolve( {smithWaterman} );
});
